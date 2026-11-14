import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import type { SessionSettings } from '@offsite/core/config'
import { NO_PROJECT } from '@offsite/core/projects'
import type { RpcMethods } from '@offsite/core/protocol'
import type { RewindRequest, RewindResult } from '@offsite/core/sessions'
import {
  agentMessages,
  history,
  rewindLive,
  Run,
  shownMessages,
} from '../lib/claude/index.ts'
import {
  stopAppServers,
  CodexRun,
  codexAgent,
  codexHistory,
  revertThread,
} from '../lib/codex/index.ts'
import { type Client, publish } from '../lib/hub.ts'
import { runs } from '../lib/live.ts'
import { keyedLock } from '../lib/locks.ts'
import {
  OpenCodeRun,
  openCodeAgent,
  openCodeHistory,
  rewindOpenCode,
} from '../lib/opencode/index.ts'
import { savePrompt } from '../storage/interactions.ts'
import { assertEnabled, providerName } from './accounts.ts'
import {
  findInOutbox,
  moveOutboxPrompt,
  addToOutbox,
  setOutboxStatus,
} from './outbox.ts'
import {
  addScratchProject,
  addWorktreeProject,
  deleteWorktreeProject,
  projectPath,
  publishProjects,
  removeScratchProject,
  restoreWorktreeFolder,
  rootProject,
} from './projects.ts'
import { notSentNotice } from './session-notices.ts'
import {
  listedUpdatedAt,
  providerOf,
  publishSessions,
  recordInteraction,
  sessions,
  updateSession,
} from './sessions.ts'
import { addStarting } from './starting-sessions.ts'
import { setUpWorktree } from './worktree-sessions.ts'

export const locked = keyedLock()
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
      return history(sessionId)
    case 'codex':
      return codexHistory(sessionId)
    case 'opencode':
      return openCodeHistory(sessionId, cwd)
  }
}

export function agentHistory(request: RpcMethods['sessions.agent']['params']) {
  switch (providerOf(request.sessionId)) {
    case 'claude':
      return agentMessages(request)
    case 'codex':
      return codexAgent(request.agentId, request.parent)
    case 'opencode':
      return openCodeAgent(request.agentId, request.parent)
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
  const disk = await shownMessages(sessionId)
  const index = disk.findIndex((item) => item.uuid === request.messageId)
  if (index < 1) {
    throw new Error('Cannot rewind the conversation to that point')
  }
  if (run.backgroundTasks > 0) {
    const lastSeen = disk.findLast(
      (item) => item.type === 'user' && item.parent_tool_use_id === null
    )
    if (lastSeen === undefined) {
      throw new Error('Cannot rewind the conversation to that point')
    }
    await rewindLive(run, request.messageId, lastSeen.uuid)
    publish(sessionId, await history(sessionId))
    return result
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
  publish(sessionId, await history(sessionId))
  return result
}

export function restart(sessionId: string) {
  return locked(sessionId, async () => {
    const run = runs.get(sessionId)
    if (run === undefined) {
      return
    }
    if (run.provider !== 'claude') {
      throw new Error('Only Claude Code threads can be restarted')
    }
    if (run.running) {
      await run.interrupt()
    }
    run.stop()
    await run.closed
    new Run({
      sessionId,
      cwd: run.cwd,
      resume: true,
      resumeAt: null,
      settings: run.settings,
    })
    publish(sessionId, await history(sessionId))
  })
}

export function stop(sessionId: string) {
  return locked(sessionId, async () => {
    const run = runs.get(sessionId)
    if (run === undefined) {
      return
    }
    if (run.provider !== 'claude') {
      throw new Error('Only Claude Code threads can be stopped')
    }
    if (run.running) {
      await run.interrupt()
    }
    run.stop()
    await run.closed
    publish(sessionId, await history(sessionId))
  })
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
  addToOutbox(request)
  try {
    await deliver(client, request)
  } catch (error) {
    setOutboxStatus(request.id, 'failed')
    notSentNotice([
      {
        id: request.id,
        sessionId: request.sessionId,
        text: request.prompt.text,
      },
    ])
    throw error
  }
}

export async function resend(client: Client, id: string) {
  const row = findInOutbox(id)
  if (row === undefined) {
    throw new Error('This message no longer exists')
  }
  if (row.status !== 'failed') {
    throw new Error('This message is already being sent')
  }
  await send(client, {
    ...row.request,
    sessionId: row.sessionId,
    projectId: row.projectId,
    worktree: row.sessionId === null ? row.request.worktree : null,
  })
}

async function deliver(
  client: Client,
  request: RpcMethods['sessions.send']['params']
) {
  assertEnabled(request.settings.provider, request.settings.accountId)
  if (request.projectId === NO_PROJECT) {
    if (request.sessionId !== null) {
      throw new Error('A started chat always has a project')
    }
    if (request.worktree !== null) {
      throw new Error('A chat without a project cannot use a worktree')
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
  if (request.worktree !== null) {
    if (request.sessionId !== null) {
      throw new Error('Only a new chat can start in a new worktree')
    }
    const project = await addWorktreeProject(
      request.projectId,
      {
        name: request.worktree.name,
        prompt: request.prompt.text,
        base: request.worktree.base,
      },
      (stage) => client.send({ type: 'worktreeStage', stage })
    )
    if (project.warning !== null) {
      client.send({ type: 'warning', message: project.warning })
    }
    const run = await startRun(project.cwd, request.settings).catch(
      async (error: unknown) => {
        await deleteWorktreeProject(project.id)
        throw error
      }
    )
    await submitFirst(client, run, request, project.id)
    if (setUpWorktree(project.id)) {
      client.send({ type: 'setup', projectId: project.id })
    }
    return
  }
  if (
    (await restoreWorktreeFolder(request.projectId)) &&
    setUpWorktree(request.projectId)
  ) {
    client.send({ type: 'setup', projectId: request.projectId })
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
  recordInteraction(sessionId, run.provider, request.status)
  addStarting({
    id: sessionId,
    provider: run.provider,
    title: request.prompt.text === '' ? 'New thread' : request.prompt.text,
    projectId,
    branch: null,
    updatedAt: Date.now(),
    claudeWorktree: false,
  })
  const session = sessions().find((item) => item.id === sessionId)
  if (session === undefined) {
    throw new Error(`${sessionId} is not listed after it started`)
  }
  client.opening = sessionId
  client.sessionId = sessionId
  client.send({ type: 'started', id: request.id, session })
  publishSessions()
  moveOutboxPrompt(request.id, sessionId, projectId)
  await run.submit(request.id, request.prompt, request.delivery)
  recordPrompt(request.settings, projectId, sessionId)
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
      (await changedElsewhere(existing))) ||
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
  await run.submit(request.id, request.prompt, request.delivery)
  recordInteraction(sessionId, provider, request.status)
  recordPrompt(request.settings, request.projectId, sessionId)
  if (emptied.has(sessionId) && request.prompt.text.trim() !== '') {
    emptied.delete(sessionId)
    await updateSession(sessionId, { title: request.prompt.text.trim() })
  }
}

function recordPrompt(
  settings: SessionSettings,
  projectId: string,
  sessionId: string
) {
  const root = rootProject(projectId)
  savePrompt({
    settings,
    project: root.id,
    worktree: root.id === projectId ? null : projectId,
    session: sessionId,
  })
  publishProjects()
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

async function changedElsewhere(run: Run) {
  if (run.messages.length === 0) {
    return false
  }
  const history = await shownMessages(run.sessionId)
  const last = history.at(-1)?.uuid
  return last !== undefined && !run.messages.some((item) => item.uuid === last)
}
