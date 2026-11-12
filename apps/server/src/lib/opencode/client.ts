import { type ChildProcess, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { setTimeout as wait } from 'node:timers/promises'
import { OpenCode, type OpenCodeClient, type V2Event } from '@opencode/client'
import { type Endpoint, headers } from '@opencode/client/service'
import { refreshSessions } from '../../services/sessions.ts'
import { isRecord } from '../claude/content.ts'
import { runs } from '../live.ts'
import { logger } from '../log.ts'
import { offsitePlugin } from '../plugin.ts'

const log = logger.withTag('opencode')

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
const START_TIMEOUT = 30_000

let connection: Promise<OpenCodeClient> | undefined
let listener: AbortController | undefined
let server: { child: ChildProcess; endpoint: Promise<Endpoint> } | undefined

process.on('exit', () => server?.child.kill())

export function findOpenCode() {
  const name = process.platform === 'win32' ? 'opencode.exe' : 'opencode'
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, name)
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile()) {
      return candidate
    }
  }
  return null
}

export function openCode() {
  connection ??= start()
  return connection
}

export function stopOpenCode() {
  const controller = listener
  listener = undefined
  connection = undefined
  controller?.abort()
  server?.child.kill()
  server = undefined
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
  const endpoint = await serve()
  log.info(`connected to OpenCode at ${endpoint.url}`)
  return OpenCode.make({ baseUrl: endpoint.url, headers: headers(endpoint) })
}

function serve() {
  if (server !== undefined) {
    return server.endpoint
  }
  const executable = findOpenCode()
  if (executable === null) {
    throw new Error('OpenCode is not installed or not on the PATH')
  }
  const password = randomBytes(24).toString('base64url')
  const plugin = offsitePlugin()
  log.info('starting the OpenCode server')
  const child = spawn(
    executable,
    ['serve', '--port', '0', '--hostname', '127.0.0.1'],
    {
      env: {
        ...process.env,
        OPENCODE_SERVER_PASSWORD: password,
        ...(plugin === null
          ? {}
          : {
              OPENCODE_CONFIG_CONTENT: configContent(
                path.join(plugin, 'skills')
              ),
            }),
      },
      stdio: ['ignore', 'pipe', 'ignore'],
    }
  )
  const started = Promise.withResolvers<Endpoint>()
  const current = { child, endpoint: started.promise }
  server = current
  const timer = setTimeout(() => {
    started.reject(
      new Error(`OpenCode did not start within ${START_TIMEOUT / 1000} seconds`)
    )
    child.kill()
  }, START_TIMEOUT)
  function exit(error: Error) {
    clearTimeout(timer)
    if (server === current) {
      server = undefined
    }
    log.info('the OpenCode server exited:', error.message)
    started.reject(error)
  }
  child.on('error', exit)
  child.on('exit', (code) =>
    exit(new Error(`OpenCode stopped (exit code ${code})`))
  )
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const match = /^server listening on (http:\/\/\S+)$/.exec(line)
    if (match === null) {
      return
    }
    clearTimeout(timer)
    started.resolve({
      url: match[1],
      auth: { type: 'basic', username: 'opencode', password },
    })
  })
  return started.promise
}

function configContent(skills: string) {
  const config: unknown = JSON.parse(
    process.env.OPENCODE_CONFIG_CONTENT ?? '{}'
  )
  if (!isRecord(config)) {
    throw new Error('OPENCODE_CONFIG_CONTENT is not a JSON object')
  }
  const existing = config.skills === undefined ? [] : config.skills
  if (!Array.isArray(existing)) {
    throw new Error('skills in OPENCODE_CONFIG_CONTENT is not an array')
  }
  return JSON.stringify({ ...config, skills: [...existing, skills] })
}

async function listen(client: OpenCodeClient) {
  const controller = new AbortController()
  listener = controller
  const silence = setTimeout(() => controller.abort(), SILENCE_LIMIT)
  try {
    for await (const event of client.event.subscribe({
      signal: controller.signal,
      onActivity: () => silence.refresh(),
    })) {
      route(event)
    }
    log.warn('the OpenCode event stream ended')
  } catch (error) {
    if (listener !== controller) {
      return
    }
    if (controller.signal.aborted) {
      log.warn(
        `the OpenCode event stream was silent for ${SILENCE_LIMIT / 1000} seconds`
      )
    } else {
      log.warn('lost the OpenCode event stream:', error)
    }
  } finally {
    clearTimeout(silence)
  }
  if (listener !== controller) {
    return
  }
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
      log.debug(`reconnect attempt ${attempt + 1} to OpenCode failed:`, error)
      failure = error
      continue
    }
    void listen(client)
    await catchUp(client).catch((error: unknown) =>
      log.warn(`could not catch up with OpenCode:`, error)
    )
    return client
  }
  log.warn(`could not reconnect to OpenCode:`, failure)
  connection = undefined
  for (const run of openCodeRuns()) {
    run.exited()
  }
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
  if (listChanges.has(event.type)) {
    refreshSessions('opencode')
  }
  const sessionId = sessionOf(event)
  if (sessionId === null) {
    return
  }
  const run = runs.get(sessionId)
  if (run?.provider === 'opencode') {
    run.receive(event)
  }
}

function sessionOf(event: V2Event) {
  if (event.type === 'form.created') {
    return event.data.form.sessionID
  }
  if (event.type === 'shell.created') {
    const sessionId: unknown = event.data.info.metadata.sessionID
    return typeof sessionId === 'string' ? sessionId : null
  }
  if (event.type === 'shell.exited') {
    return (
      openCodeRuns().find((run) => event.data.id in run.tasks)?.sessionId ??
      null
    )
  }
  const data: unknown = 'data' in event ? event.data : null
  if (isRecord(data) && typeof data.sessionID === 'string') {
    return data.sessionID
  }
  return null
}

function openCodeRuns() {
  return [...runs.values()].flatMap((run) =>
    run.provider === 'opencode' ? [run] : []
  )
}
