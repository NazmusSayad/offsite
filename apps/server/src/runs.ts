import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { getSessionMessages } from '@anthropic-ai/claude-agent-sdk'
import { history } from './history.ts'
import { type Client, publish } from './hub.ts'
import type { Methods, Rewind, RewindResult, Settings } from './protocol.ts'
import { Run, runs } from './run.ts'

export function stopAll() {
  for (const run of runs.values()) run.stop()
}

export async function rewind(request: Rewind): Promise<RewindResult> {
  const sessionId = request.sessionId
  if (runs.get(sessionId)?.running === true)
    throw new Error('Stop Claude before rewinding')
  const run = runFor(sessionId, request.cwd, request.settings)
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
    return
  }
  const existing = runs.get(request.sessionId)
  if (
    existing !== undefined &&
    !existing.running &&
    (await changedElsewhere(existing, request.cwd))
  )
    existing.stop()
  const run = runFor(request.sessionId, request.cwd, request.settings)
  if (run === existing) await run.configure(request.settings)
  else await open(client, request.sessionId, request.cwd)
  run.submit(request.prompt, request.delivery)
}

function runFor(sessionId: string, cwd: string, settings: Settings) {
  const run = runs.get(sessionId)
  if (run !== undefined && run.settings.accountId === settings.accountId)
    return run
  if (run !== undefined) {
    if (run.running)
      throw new Error('Wait for this turn to finish before switching accounts')
    run.stop()
  }
  return new Run({ sessionId, cwd, resume: true, resumeAt: null, settings })
}

async function changedElsewhere(run: Run, cwd: string) {
  if (run.messages.length === 0) return false
  const history = await getSessionMessages(run.sessionId, { dir: cwd })
  const last = history.at(-1)?.uuid
  return last !== undefined && !run.messages.some((item) => item.uuid === last)
}
