import { accessSync, constants, statSync } from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { createServer as createSecureServer } from 'node:https'
import path from 'node:path'
import { mediaTypes } from '@offsite/core/media'
import { consola } from 'consola'
import { WebSocketServer } from 'ws'
import { logIn, watchPaired } from './api/login.ts'
import { args } from './args.ts'
import { findClaude } from './lib/claude/index.ts'
import { logger } from './lib/log.ts'
import { proxySocket, serveProxy } from './lib/proxy/proxy.ts'
import { serveAppIcon } from './services/app-icon.ts'
import { backfillSessionProviders } from './services/backfill-session-providers.ts'
import { saveBrowserLogs } from './services/browser-logs.ts'
import { scheduleCleanup } from './services/cleanup/cleanup.ts'
import {
  addConnection,
  listMachines,
  removeConnections,
} from './services/connections.ts'
import {
  canBrowse,
  serveMedia,
  setBrowseHeaders,
  sniffType,
  streamFile,
} from './services/files.ts'
import { serveGithubMedia } from './services/github-images.ts'
import { loadHttps, removeHttps, saveHttps } from './services/https.ts'
import { serveNotificationIcon } from './services/notification-icons.ts'
import { serveNotificationImage } from './services/notification-images.ts'
import { failInterrupted } from './services/outbox.ts'
import { startPush } from './services/push.ts'
import { stopAll } from './services/runs.ts'
import {
  install,
  status,
  uninstall,
  update,
} from './services/service/commands.ts'
import { answerStatus, statusSecret } from './services/service/status.ts'
import { startService } from './services/service/update.ts'
import { refreshAll, watchSessions } from './services/sessions.ts'
import { contentTypes, publicDir, serveFile } from './services/web-app.ts'
import {
  addCode,
  findDevice,
  hasDevices,
  readDevices,
  redeemCode,
  removeDevices,
} from './storage/auth.ts'
import { claudeBaseDir } from './storage/config.ts'
import { listenServer, lockHome, writeJson } from './storage/storage.ts'

const log = logger.withTag('server')

const browseTypes = new Map([
  ...Object.entries(contentTypes),
  ...mediaTypes,
  ['.htm', 'text/html; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.pdf', 'application/pdf'],
  ['.xml', 'application/xml'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
])

const tls =
  args.command === 'web' || args.command === 'serve' ? loadHttps() : null
const listening = listenServer(tls !== null)
const port = listening.port
const protocol = listening.https ? 'https' : 'http'
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`invalid port ${args.port}`)
  log.error(`invalid port ${args.port}`)
  process.exit(1)
}

const address = `${protocol}://${args.host}:${port}`

if (args.command === 'pair') {
  const links = pairingLinks(addCode(args.name))
  console.log('Open this link in a browser within 5 minutes to pair it:')
  console.log(`  ${links.local}`)
  console.log(
    'Or connect another offsite to this one by running there: offsite connect add <this link>'
  )
  process.exit(0)
}

if (args.command === 'connect-add') {
  if (args.connection === null) {
    throw new Error('offsite connect add needs a pairing link')
  }
  await addConnection(args.connection)
  process.exit(0)
}

if (args.command === 'connect-remove') {
  await removeConnections()
  process.exit(0)
}

if (args.command === 'unpair') {
  await unpair()
  process.exit(0)
}

if (args.command === 'install') {
  await install()
  process.exit(0)
}

if (args.command === 'uninstall') {
  await uninstall()
  process.exit(0)
}

if (args.command === 'status') {
  await status()
  process.exit(0)
}

if (args.command === 'update') {
  await update()
  process.exit(0)
}

if (args.command === 'https') {
  if (args.https === null) {
    throw new Error('offsite https needs a certificate and a key')
  }
  saveHttps(args.https)
  process.exit(0)
}

if (args.command === 'https-rm') {
  removeHttps()
  process.exit(0)
}

lockHome()
log.info(
  `starting offsite ${args.command} with pid ${process.pid} on ${address}, dir ${args.dir}, auth ${args.auth ? 'on' : 'off'}`
)

process.env.CLAUDE_CONFIG_DIR = claudeBaseDir()
await backfillSessionProviders()
failInterrupted()
watchSessions()
refreshAll()
scheduleCleanup()

if (findClaude() === null) {
  console.error('could not find claude on PATH; install Claude Code first')
  log.error('could not find claude on PATH; install Claude Code first')
  process.exit(1)
}

const code = args.auth && args.pair && !hasDevices() ? addCode(null) : null

const server =
  tls === null ? createServer(listener) : createSecureServer(tls, listener)

function listener(request: IncomingMessage, response: ServerResponse) {
  try {
    answerRequest(request, response)
  } catch (error) {
    log.warn('a request failed:', error)
    if (response.headersSent) {
      response.destroy()
      return
    }
    response.statusCode = 500
    response.end('request failed')
  }
}

function answerRequest(request: IncomingMessage, response: ServerResponse) {
  const url = URL.parse(request.url ?? '/', 'http://localhost')
  if (url === null) {
    response.statusCode = 400
    response.end('bad url')
    return
  }
  if (url.pathname === '/api/media') {
    serveMedia(url.searchParams.get('token'), request, response)
    return
  }
  if (url.pathname === '/api/github-media') {
    void serveGithubMedia(url.searchParams.get('token'), request, response)
    return
  }
  if (url.pathname.startsWith('/api/browse/')) {
    serveBrowse(url.pathname, request, response)
    return
  }
  if (url.pathname.startsWith('/api/proxy/')) {
    serveProxy(request, response)
    return
  }
  if (url.pathname === `/api/status/${statusSecret}`) {
    void answerStatus(response)
    return
  }
  if (url.pathname.startsWith('/api/notification-image/')) {
    serveNotificationImage(url.pathname, response)
    return
  }
  if (url.pathname.startsWith('/api/notification-icon/')) {
    void serveNotificationIcon(url.pathname, request, response)
    return
  }
  if (url.pathname.startsWith('/api/app-icon/')) {
    void serveAppIcon(publicDir, url.pathname, response)
    return
  }
  if (url.pathname.startsWith('/api/')) {
    answerApi(url.pathname, request, response)
    return
  }
  if (args.command === 'serve') {
    response.statusCode = 404
    response.end('offsite serve has no web app')
    return
  }
  serveFile(url.pathname, request, response)
}

const sockets = new WebSocketServer({ noServer: true, perMessageDeflate: true })

server.on('upgrade', (request, socket, head) => {
  const url = URL.parse(request.url ?? '/', 'http://localhost')
  if (url === null) {
    socket.destroy()
    return
  }
  if (url.pathname.startsWith('/api/proxy/')) {
    proxySocket(request, socket, head)
    return
  }
  const remoteAddress = request.socket.remoteAddress
  if (url.pathname !== '/ws' || remoteAddress === undefined) {
    socket.destroy()
    return
  }
  sockets.handleUpgrade(request, socket, head, (client) =>
    logIn(client, remoteAddress)
  )
})

if (args.auth) {
  watchPaired()
}

server.listen(port, args.host, () => {
  writeJson('server.json', {
    port,
    https: tls !== null,
    status: `${protocol}://${loopback(args.host)}:${port}/api/status/${statusSecret}`,
    service: args.service,
  })
  if (args.service) {
    startService()
  }
  startPush(`${args.host}:${port}`)
  if (args.connect === null && args.pair && (code !== null || !args.auth)) {
    const links = pairingLinks(code)
    if (args.command === 'web') {
      console.log(`offsite is running at ${links.local}`)
    }
  } else {
    console.log(`offsite is running at ${address}`)
    if (args.auth && args.pair) {
      console.log('Run offsite pair to pair another browser')
    }
  }
  log.info(`listening on ${address}`)
  if (!args.auth) {
    console.warn(
      'auth is off; anyone who can reach this port can control this machine'
    )
    log.warn(
      'auth is off; anyone who can reach this port can control this machine'
    )
  }
})

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

function stop(signal: NodeJS.Signals) {
  log.info(`stopping on ${signal}`)
  stopAll()
  process.exit(0)
}

function answerApi(
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse
) {
  response.setHeader('access-control-allow-origin', '*')
  if (request.method === 'OPTIONS') {
    response.setHeader('access-control-allow-methods', 'POST')
    response.setHeader('access-control-allow-headers', 'authorization')
    response.statusCode = 204
    response.end()
    return
  }
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.end('use POST')
    return
  }
  const given =
    request.headers.authorization?.match(/^Bearer (.+)$/)?.[1] ?? null
  if (pathname === '/api/pair') {
    const token = given === null ? null : redeemCode(given)
    if (token === null) {
      response.statusCode = 401
      response.end('That pairing code expired or was already used')
      return
    }
    answerJson(response, { token })
    return
  }
  if (pathname === '/api/machines') {
    const machines = listMachines(given)
    if (machines === null) {
      response.statusCode = 401
      response.end('This browser needs pairing')
      return
    }
    answerJson(response, machines)
    return
  }
  if (pathname === '/api/logs') {
    const device = given === null ? null : findDevice(given)
    if (args.auth && device === null) {
      response.statusCode = 401
      response.end('This browser needs pairing')
      return
    }
    void saveBrowserLogs(device, request, response)
    return
  }
  response.statusCode = 404
  response.end('not found')
}

function serveBrowse(
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse
) {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.end('use GET')
    return
  }
  const rest = pathname.slice('/api/browse/'.length)
  const slash = rest.indexOf('/')
  if (
    slash === -1 ||
    !canBrowse(rest.slice(0, slash), request.socket.remoteAddress)
  ) {
    response.statusCode = 404
    response.end('This browser link expired')
    return
  }
  let file
  try {
    file = decodeURIComponent(
      rest.slice(process.platform === 'win32' ? slash + 1 : slash)
    )
  } catch {
    response.statusCode = 400
    response.end('bad path')
    return
  }
  let stats
  let contentType
  try {
    stats = statSync(file, { throwIfNoEntry: false })
    if (stats === undefined || !stats.isFile()) {
      response.statusCode = 404
      response.end(`${file} is not a file`)
      return
    }
    accessSync(file, constants.R_OK)
    contentType =
      browseTypes.get(path.extname(file).toLowerCase()) ?? sniffType(file)
  } catch (error) {
    response.statusCode = 500
    response.end(`Could not read ${file}: ${error}`)
    return
  }
  setBrowseHeaders(response, contentType)
  streamFile(file, stats.size, request, response)
}

function loopback(host: string) {
  if (host === '0.0.0.0') {
    return '127.0.0.1'
  }
  if (host === '::') {
    return '[::1]'
  }
  if (host.includes(':')) {
    return `[${host}]`
  }
  return host
}

function answerJson(response: ServerResponse, body: unknown) {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}

async function unpair() {
  const devices = readDevices()
  if (devices.length === 0) {
    console.log('No browsers are paired')
    return
  }
  if (!process.stdin.isTTY) {
    console.error('offsite unpair needs an interactive terminal')
    process.exit(1)
  }
  const picked = (await consola.prompt('Which browsers should be unpaired?', {
    type: 'multiselect',
    required: false,
    cancel: 'null',
    options: devices.map((item) => ({
      value: item.hash,
      label: [
        item.name ?? 'Unnamed',
        `paired ${new Date(item.createdAt).toLocaleString()}`,
        `${item.expiresAt <= Date.now() ? 'expired' : 'expires'} ${new Date(item.expiresAt).toLocaleString()}`,
        item.lastUsedAt === null
          ? 'never used'
          : `last used ${new Date(item.lastUsedAt).toLocaleString()}`,
      ].join(' · '),
    })),
  })) as unknown as string[] | null
  if (picked === null || picked.length === 0) {
    console.log('Nothing unpaired')
    return
  }
  removeDevices(picked)
  console.log(
    `Unpaired ${picked.length} ${picked.length === 1 ? 'browser' : 'browsers'}; a running offsite disconnects them within seconds`
  )
}

function pairingLinks(code: string | null) {
  return {
    local: `${address}/pair#${new URLSearchParams({
      machine: address,
      ...(code !== null && { code }),
    })}`,
  }
}
