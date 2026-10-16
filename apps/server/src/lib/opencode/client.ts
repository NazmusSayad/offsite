import { statSync } from 'node:fs'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { OpenCode, type OpenCodeClient, type V2Event } from '@opencode/client'
import { ensure, headers } from '@opencode/client/service'
import { refreshSessions } from '../../services/sessions.ts'
import { runs } from '../live.ts'

const listChanges = new Set([
  'session.created',
  'session.renamed',
  'session.moved',
  'session.forked',
  'session.deleted',
  'session.execution.succeeded',
  'session.execution.failed',
  'session.execution.interrupted',
])

let connection: Promise<OpenCodeClient> | undefined

export function findOpenCode() {
  const name = process.platform === 'win32' ? 'opencode.exe' : 'opencode'
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, name)
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile())
      return candidate
  }
  return null
}

export function openCode() {
  connection ??= connect()
  return connection
}

async function connect() {
  try {
    const endpoint = await ensure()
    const client = OpenCode.make({
      baseUrl: endpoint.url,
      headers: headers(endpoint),
    })
    void listen(client)
    return client
  } catch (error) {
    connection = undefined
    throw error
  }
}

async function listen(client: OpenCodeClient) {
  try {
    for await (const event of client.event.subscribe()) route(event)
    console.warn('the OpenCode event stream ended')
  } catch (error) {
    console.warn(`lost the OpenCode event stream: ${error}`)
  }
  connection = undefined
  if (openCodeRuns().length === 0) return
  await setTimeout(1000)
  try {
    const active = await (await openCode()).session.active()
    for (const run of openCodeRuns()) run.resync(run.sessionId in active)
    refreshSessions()
  } catch (error) {
    console.warn(`could not reconnect to OpenCode: ${error}`)
    for (const run of openCodeRuns()) run.exited()
  }
}

function route(event: V2Event) {
  if (listChanges.has(event.type)) refreshSessions()
  const sessionId = sessionOf(event)
  if (sessionId === null) return
  const run = runs.get(sessionId)
  if (run?.provider === 'opencode') run.receive(event)
}

function sessionOf(event: V2Event) {
  if (event.type === 'form.created') return event.data.form.sessionID
  const data: unknown = 'data' in event ? event.data : null
  if (
    typeof data === 'object' &&
    data !== null &&
    'sessionID' in data &&
    typeof data.sessionID === 'string'
  )
    return data.sessionID
  return null
}

function openCodeRuns() {
  return [...runs.values()].flatMap((run) =>
    run.provider === 'opencode' ? [run] : []
  )
}
