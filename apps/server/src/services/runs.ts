import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import type { SessionSettings } from '@offsite/core/config'
import { NO_PROJECT } from '@offsite/core/projects'
import type { RpcMethods } from '@offsite/core/protocol'
import type { RewindRequest, RewindResult } from '@offsite/core/sessions'
import { history, Run } from '../lib/claude/index.ts'
import {
  stopAppServers,
  CodexRun,
  codexHistory,
  revertThread,
} from '../lib/codex/index.ts'
import { type Client, publish } from '../lib/hub.ts'
import { runs } from '../lib/live.ts'
import {
  OpenCodeRun,
  openCodeHistory,
  rewindOpenCode,
} from '../lib/opencode/index.ts'
import { assertEnabled, providerName } from './accounts.ts'
import {
  addScratchProject,
  projectPath,
  removeScratchProject,
} from './projects.ts'
import {
  listedUpdatedAt,
  providerOf,
  recordInteraction,
  updateSession,
} from './sessions.ts'

const locks = new Map<string, Promise<void>>()
const emptied = new Set<string>()

export function stopAll() {
  for (const run of runs.values()) {
    run.stop()
  }
  stopAppServers()
}

export function sessionHistory(sessionId: string, cwd: string) {
  switch (providerOf(sessionId)) {
    case 'claude':
      return history(sessionId, cwd)
    case 'codex':
      return codexHistory(sessionId)
    case 'opencode':
      return openCodeHistory(sessionId, cwd)
  }
}

export function rewind(request: RewindRequest): Promise<RewindResult> {
  return locked(request.sessionId, () => rewindNow(request))
}

async function rewindNow(request: RewindRequest): Promise<RewindResult> {
  const sessionId = request.sessionId
  const cwd = projectPath(request.projectId)
  if (runs.get(sessionId)?.running === true) {
    throw new Error(
      `Stop ${providerName(providerOf(sessionId))} before rewinding`
    )
  }
  if ((runs.get(sessionId)?.backgroundTasks ?? 0) > 0) {
    throw new Error('Wait for background tasks to finish before rewinding')
  }
  const run = await runFor(sessionId, cwd, request.settings)
  if (run.provider === 'codex') {
    if (request.code) {
      throw new Error('Codex cannot restore files')
    }
    if (request.dryRun || !request.conversation) {
      return null
    }
    await revertThread(sessionId, request.messageId)
    run.items.clear()
    const event = await codexHistory(sessionId)
    if (event.type === 'history' && event.items.length === 0) {
      emptied.add(sessionId)
    }
    publish(sessionId, event)
    return null
  }
  if (run.provider === 'opencode') {
    const result = await rewindOpenCode(request)
    if (request.dryRun) {
      return result
    }
    run.items.clear()
    publish(sessionId, await openCodeHistory(sessionId, cwd))
    return result
  }
  let result: RewindResult = null
  if (request.code) {
    const files = await run.query.rewindFiles(request.messageId, {
      dryRun: request.dryRun,
    })
    if (!files.canRewind) {
      throw new Error(files.error ?? 'The files cannot be restored')
    }
    result = {
      files: files.filesChanged ?? [],
      insertions: files.insertions ?? 0,
      deletions: files.deletions ?? 0,
    }
  }
  if (request.dryRun || !request.conversation) {
    return result
  }
  const disk = await getSessionMessages(sessionId, { dir: cwd })
  const index = disk.findIndex((item) => item.uuid === request.messageId)
  if (index < 1) {
    throw new Error('Cannot rewind the conversation to that point')
  }
  run.stop()
  await run.closed
  new Run({
    sessionId,
    cwd,
    resume: true,
    resumeAt: disk[index - 1].uuid,
    settings: request.settings,
  })
  publish(sessionId, await history(sessionId, cwd))
  return result
}

export async function open(
  client: Client,
  sessionId: string,
  projectId: string
) {
  client.opening = sessionId
  const event = await sessionHistory(sessionId, projectPath(projectId))
  if (client.opening !== sessionId) {
    return
  }
  client.sessionId = sessionId
  client.send(event)
}

export async function send(
  client: Client,
  request: RpcMethods['sessions.send']['params']
) {
  assertEnabled(request.settings.provider, request.settings.accountId)
  if (request.projectId === NO_PROJECT) {
    if (request.sessionId !== null) {
      throw new Error('A started chat always has a project')
    }
    const project = await addScratchProject(request.prompt.text)
    const run = await startRun(project.path, request.settings).catch(
      async (error: unknown) => {
        await removeScratchProject(project.id, project.path)
        throw error
      }
    )
    await submitFirst(client, run, request, project.id)
    return
  }
  const cwd = projectPath(request.projectId)
  if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`${cwd} is not a folder`)
  }
  if (request.sessionId === null) {
    const run = await startRun(cwd, request.settings)
    await submitFirst(client, run, request, request.projectId)
    return
  }
  const sessionId = request.sessionId
  await locked(sessionId, () => sendExisting(client, sessionId, cwd, request))
}

async function submitFirst(
  client: Client,
  run: Awaited<ReturnType<typeof startRun>>,
  request: RpcMethods['sessions.send']['params'],
  projectId: string
) {
  const sessionId = run.sessionId
  client.opening = sessionId
  client.sessionId = sessionId
  client.send({
    type: 'started',
    sessionId,
    projectId,
    from: request.projectId,
  })
  await run.submit(request.prompt, request.delivery)
  recordInteraction(sessionId)
}

async function sendExisting(
  client: Client,
  sessionId: string,
  cwd: string,
  request: RpcMethods['sessions.send']['params']
) {
  const provider = providerOf(sessionId)
  if (request.settings.provider !== provider) {
    throw new Error(`This session belongs to ${providerName(provider)}`)
  }
  const existing = runs.get(sessionId)
  if (
    (existing?.provider === 'claude' &&
      !existing.running &&
      existing.backgroundTasks === 0 &&
      (await changedElsewhere(existing, cwd))) ||
    (existing?.provider === 'codex' &&
      !existing.running &&
      existing.pending.size === 0 &&
      (listedUpdatedAt('codex', sessionId) ?? 0) > existing.activeAt)
  ) {
    existing.stop()
    await existing.closed
  }
  const run = await runFor(sessionId, cwd, request.settings)
  if (run === existing) {
    await run.configure(request.settings)
  } else {
    await open(client, sessionId, request.projectId)
  }
  await run.submit(request.prompt, request.delivery)
  recordInteraction(sessionId)
  if (emptied.has(sessionId) && request.prompt.text.trim() !== '') {
    emptied.delete(sessionId)
    await updateSession(sessionId, { title: request.prompt.text.trim() })
  }
}

async function locked<T>(sessionId: string, task: () => Promise<T>) {
  const previous = locks.get(sessionId) ?? Promise.resolve()
  const result = previous.then(task)
  const done = result.then(
    () => undefined,
    () => undefined
  )
  locks.set(sessionId, done)
  await done
  if (locks.get(sessionId) === done) {
    locks.delete(sessionId)
  }
  return result
}

async function runFor(
  sessionId: string,
  cwd: string,
  settings: SessionSettings
) {
  const run = runs.get(sessionId)
  if (run !== undefined && run.settings.accountId === settings.accountId) {
    return run
  }
  if (run !== undefined) {
    if (run.running) {
      throw new Error('Wait for this turn to finish before switching accounts')
    }
    if (run.backgroundTasks > 0) {
      throw new Error(
        'Wait for background tasks to finish before switching accounts'
      )
    }
    run.stop()
    await run.closed
  }
  switch (settings.provider) {
    case 'claude':
      return new Run({
        sessionId,
        cwd,
        resume: true,
        resumeAt:
          run?.provider === 'claude' && run.messages.length === 0
            ? run.resumeAt
            : null,
        settings,
      })
    case 'codex':
      return CodexRun.resume(sessionId, cwd, settings)
    case 'opencode':
      return OpenCodeRun.resume(sessionId, cwd, settings)
  }
}

async function startRun(cwd: string, settings: SessionSettings) {
  switch (settings.provider) {
    case 'claude':
      return new Run({
        sessionId: randomUUID(),
        cwd,
        resume: false,
        resumeAt: null,
        settings,
      })
    case 'codex':
      return CodexRun.start(cwd, settings)
    case 'opencode':
      return OpenCodeRun.start(cwd, settings)
  }
}

async function changedElsewhere(run: Run, cwd: string) {
  if (run.messages.length === 0) {
    return false
  }
  const history = await getSessionMessages(run.sessionId, { dir: cwd })
  const last = history.at(-1)?.uuid
  return last !== undefined && !run.messages.some((item) => item.uuid === last)
}
