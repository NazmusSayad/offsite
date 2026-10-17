import { statSync } from 'node:fs'
import path from 'node:path'
import { setTimeout as wait } from 'node:timers/promises'
import { OpenCode, type OpenCodeClient, type V2Event } from '@opencode/client'
import { ensure, headers } from '@opencode/client/service'
import { refreshSessions } from '../../services/sessions.ts'
import { isRecord } from '../claude/content.ts'
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

const SILENCE_LIMIT = 45_000
const RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY = 2000

let connection: Promise<OpenCodeClient> | undefined
let listener: AbortController | undefined

export function findOpenCode() {
  const name = process.platform === 'win32' ? 'opencode.exe' : 'opencode'
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, name)
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile())
      {return candidate}
  }
  return null
}

export function openCode() {
  connection ??= start()
  return connection
}

export function disconnectOpenCode() {
  const controller = listener
  listener = undefined
  connection = undefined
  controller?.abort()
}

async function start() {
  try {
    const client = await connect()
    void listen(client)
    return client
  } catch (error) {
    connection = undefined
    throw error
  }
}

async function connect() {
  const endpoint = await ensure()
  return OpenCode.make({ baseUrl: endpoint.url, headers: headers(endpoint) })
}

async function listen(client: OpenCodeClient) {
  const controller = new AbortController()
  listener = controller
  const silence = setTimeout(() => controller.abort(), SILENCE_LIMIT)
  try {
    for await (const event of client.event.subscribe({
      signal: controller.signal,
      onActivity: () => silence.refresh(),
    }))
      {route(event)}
    console.warn('the OpenCode event stream ended')
  } catch (error) {
    if (listener !== controller) {return}
    console.warn(
      controller.signal.aborted
        ? `the OpenCode event stream was silent for ${SILENCE_LIMIT / 1000} seconds`
        : `lost the OpenCode event stream: ${error}`
    )
  } finally {
    clearTimeout(silence)
  }
  if (listener !== controller) {return}
  connection = reconnect()
  connection.catch(() => undefined)
}

async function reconnect() {
  let failure: unknown
  for (let attempt = 0; attempt < RECONNECT_ATTEMPTS; attempt++) {
    await wait(RECONNECT_DELAY)
    let client: OpenCodeClient
    try {
      client = await connect()
    } catch (error) {
      failure = error
      continue
    }
    void listen(client)
    await catchUp(client).catch((error: unknown) =>
      console.warn(`could not catch up with OpenCode: ${error}`)
    )
    return client
  }
  console.warn(`could not reconnect to OpenCode: ${failure}`)
  connection = undefined
  for (const run of openCodeRuns()) {run.exited()}
  refreshSessions('opencode')
  throw failure
}

async function catchUp(client: OpenCodeClient) {
  const active = await client.session.active()
  for (const run of openCodeRuns()) {
    const [permissions, forms] = await Promise.all([
      client.permission.request.list({ location: { directory: run.cwd } }),
      client.session.form.list({ sessionID: run.sessionId }),
    ])
    run.reconcile(
      client,
      run.sessionId in active,
      permissions.data.filter(
        (permission) => permission.sessionID === run.sessionId
      ),
      forms
    )
  }
  refreshSessions('opencode')
}

function route(event: V2Event) {
  if (listChanges.has(event.type)) {refreshSessions('opencode')}
  const sessionId = sessionOf(event)
  if (sessionId === null) {return}
  const run = runs.get(sessionId)
  if (run?.provider === 'opencode') {run.receive(event)}
}

function sessionOf(event: V2Event) {
  if (event.type === 'form.created') {return event.data.form.sessionID}
  const data: unknown = 'data' in event ? event.data : null
  if (isRecord(data) && typeof data.sessionID === 'string')
    {return data.sessionID}
  return null
}

function openCodeRuns() {
  return [...runs.values()].flatMap((run) =>
    run.provider === 'opencode' ? [run] : []
  )
}
