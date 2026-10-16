import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import { history } from './history.ts'
import { type Client, publish } from './hub.ts'
import type { Methods, Rewind, RewindResult, Settings } from './protocol.ts'
import { Run, runs } from './run.ts'
import { recordPrompt } from './sessions.ts'

const locks = new Map<string, Promise<void>>()

export function stopAll() {
  for (const run of runs.values()) run.stop()
}

export function rewind(request: Rewind): Promise<RewindResult> {
  return locked(request.sessionId, () => rewindNow(request))
}

async function rewindNow(request: Rewind): Promise<RewindResult> {
  const sessionId = request.sessionId
  if (runs.get(sessionId)?.running === true)
    throw new Error('Stop Claude before rewinding')
  if ((runs.get(sessionId)?.backgroundTasks ?? 0) > 0)
    throw new Error('Wait for background tasks to finish before rewinding')
  const run = await runFor(sessionId, request.cwd, request.settings)
  let result: RewindResult = null
  if (request.code) {
    const files = await run.query.rewindFiles(request.messageId, {
      dryRun: request.dryRun,
    })
    if (!files.canRewind)
      throw new Error(files.error ?? 'The files cannot be restored')
    result = {
      files: files.filesChanged ?? [],
      insertions: files.insertions ?? 0,
      deletions: files.deletions ?? 0,
    }
  }
  if (request.dryRun || !request.conversation) return result
  const disk = await getSessionMessages(sessionId, { dir: request.cwd })
  const index = disk.findIndex((item) => item.uuid === request.messageId)
  if (index < 1) throw new Error('Cannot rewind the conversation to that point')
  run.stop()
  await run.closed
  new Run({
    sessionId,
    cwd: request.cwd,
    resume: true,
    resumeAt: disk[index - 1].uuid,
    settings: request.settings,
  })
  publish(sessionId, await history(sessionId, request.cwd))
  return result
}

export async function open(client: Client, sessionId: string, cwd: string) {
  client.opening = sessionId
  const event = await history(sessionId, cwd)
  if (client.opening !== sessionId) return
  client.sessionId = sessionId
  client.send(event)
}

export async function send(
  client: Client,
  request: Methods['sessions.send']['params']
) {
  if (!statSync(request.cwd, { throwIfNoEntry: false })?.isDirectory())
    throw new Error(`${request.cwd} is not a folder`)
  if (request.sessionId === null) {
    const sessionId = randomUUID()
    const run = new Run({
      sessionId,
      cwd: request.cwd,
      resume: false,
      resumeAt: null,
      settings: request.settings,
    })
    client.opening = sessionId
    client.sessionId = sessionId
    client.send({ type: 'started', sessionId, cwd: request.cwd })
    run.submit(request.prompt, request.delivery)
    recordPrompt(sessionId)
    return
  }
  const sessionId = request.sessionId
  await locked(sessionId, () => sendExisting(client, sessionId, request))
}

async function sendExisting(
  client: Client,
  sessionId: string,
  request: Methods['sessions.send']['params']
) {
  const existing = runs.get(sessionId)
  if (
    existing !== undefined &&
    !existing.running &&
    existing.backgroundTasks === 0 &&
    (await changedElsewhere(existing, request.cwd))
  ) {
    existing.stop()
    await existing.closed
  }
  const run = await runFor(sessionId, request.cwd, request.settings)
  if (run === existing) await run.configure(request.settings)
  else await open(client, sessionId, request.cwd)
  run.submit(request.prompt, request.delivery)
  recordPrompt(sessionId)
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
  if (locks.get(sessionId) === done) locks.delete(sessionId)
  return result
}

async function runFor(sessionId: string, cwd: string, settings: Settings) {
  const run = runs.get(sessionId)
  if (run !== undefined && run.settings.accountId === settings.accountId)
    return run
  if (run !== undefined) {
    if (run.running)
      throw new Error('Wait for this turn to finish before switching accounts')
    if (run.backgroundTasks > 0)
      throw new Error(
        'Wait for background tasks to finish before switching accounts'
      )
    run.stop()
    await run.closed
  }
  return new Run({ sessionId, cwd, resume: true, resumeAt: null, settings })
}

async function changedElsewhere(run: Run, cwd: string) {
  if (run.messages.length === 0) return false
  const history = await getSessionMessages(run.sessionId, { dir: cwd })
  const last = history.at(-1)?.uuid
  return last !== undefined && !run.messages.some((item) => item.uuid === last)
}
