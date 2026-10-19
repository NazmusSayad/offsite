import { randomBytes } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import path from 'node:path'
import { mediaTypes } from '@offsite/core/media'
import { consola } from 'consola'
import { type WebSocket, WebSocketServer } from 'ws'
import { z } from 'zod'
import { connectClient } from './api/socket.ts'
import { args } from './args.ts'
import { findClaude } from './lib/claude/index.ts'
import { broadcast, clients } from './lib/hub.ts'
import { browseToken, findMediaLink } from './services/files.ts'
import { installOpen, openSecret } from './services/open/open.ts'
import { startPush } from './services/push.ts'
import { stopAll } from './services/runs.ts'
import { refreshAll, watchSessions } from './services/sessions.ts'
import {
  addCode,
  findDevice,
  hasDevices,
  isPaired,
  readDevices,
  recordUse,
  redeemCode,
  removeDevices,
} from './storage/auth.ts'
import { claudeBaseDir } from './storage/config.ts'
import { lockHome } from './storage/storage.ts'

const UNPAIR_CHECK = 5000
const TICKET_LIFETIME = 60_000
const SNIFF_LENGTH = 8000
const openBody = z.object({ path: z.string() })

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
}

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

const port = Number(args.port)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`invalid port ${args.port}`)
  process.exit(1)
}

const address = `http://${args.host}:${port}`

if (args.command === 'pair') {
  const links = pairingLinks(addCode(args.name))
  console.log('Open this link in a browser within 5 minutes to pair it:')
  console.log(`  ${links.local}`)
  process.exit(0)
}

if (args.command === 'unpair') {
  await unpair()
  process.exit(0)
}

lockHome()

process.env.CLAUDE_CONFIG_DIR = claudeBaseDir()
installOpen(args.host, port)
watchSessions()
refreshAll()

if (findClaude() === null) {
  console.error('could not find claude on PATH; install Claude Code first')
  process.exit(1)
}

const publicDir = path.join(import.meta.dirname, '..', '..', 'web', 'dist')
const code = args.auth && args.pair && !hasDevices() ? addCode(null) : null
const tickets = new Map<string, { device: string; expiresAt: number }>()

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname === '/api/media') {
    serveMedia(url.searchParams.get('token'), request, response)
    return
  }
  if (url.pathname.startsWith('/api/browse/')) {
    serveBrowse(url.pathname, request, response)
    return
  }
  if (url.pathname === `/api/open/${openSecret}`) {
    void answerOpen(request, response)
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
  serveFile(url.pathname, response)
})

const sockets = new WebSocketServer({ noServer: true })
const paired = new Map<WebSocket, string>()

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const device = args.auth ? redeemTicket(url.searchParams.get('ticket')) : null
  if (url.pathname !== '/ws' || (args.auth && device === null)) {
    socket.destroy()
    return
  }
  sockets.handleUpgrade(request, socket, head, (client) => {
    connectClient(client)
    if (device === null) {
      return
    }
    paired.set(client, device)
    client.on('close', () => paired.delete(client))
    recordUse(device)
  })
})

if (args.auth) {
  setInterval(() => {
    for (const [client, device] of paired) {
      if (!isPaired(device)) {
        client.close()
      }
    }
    for (const [ticket, item] of tickets) {
      if (item.expiresAt <= Date.now()) {
        tickets.delete(ticket)
      }
    }
  }, UNPAIR_CHECK)
}

server.listen(port, args.host, () => {
  startPush(`${args.host}:${port}`)
  if (args.pair && (code !== null || !args.auth)) {
    const links = pairingLinks(code)
    if (args.command === 'web') {
      console.log(`offsite is running at ${links.local}`)
    }
  } else {
    console.log(`offsite is running at ${address}`)
    if (args.pair) {
      console.log('Run offsite pair to pair another browser')
    }
  }
  if (!args.auth) {
    console.warn(
      'auth is off; anyone who can reach this port can control this machine'
    )
  }
})

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

function stop() {
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
  if (pathname === '/api/ticket') {
    if (!args.auth) {
      answerJson(response, { ticket: null })
      return
    }
    const device = given === null ? null : findDevice(given)
    if (device === null) {
      response.statusCode = 401
      response.end('This browser needs pairing')
      return
    }
    const ticket = randomBytes(32).toString('base64url')
    tickets.set(ticket, { device, expiresAt: Date.now() + TICKET_LIFETIME })
    answerJson(response, { ticket })
    return
  }
  response.statusCode = 404
  response.end('not found')
}

function serveMedia(
  token: string | null,
  request: IncomingMessage,
  response: ServerResponse
) {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.end('use GET')
    return
  }
  const link = findMediaLink(token)
  if (link === null) {
    response.statusCode = 404
    response.end('This media link expired')
    return
  }
  const stats = statSync(link.file, { throwIfNoEntry: false })
  if (stats === undefined || !stats.isFile()) {
    response.statusCode = 404
    response.end('not found')
    return
  }
  response.setHeader('access-control-allow-origin', '*')
  response.setHeader('content-type', link.mediaType)
  if (link.download !== null) {
    response.setHeader(
      'content-disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(link.download)}`
    )
  }
  response.setHeader('cache-control', 'private, max-age=3600')
  response.setHeader('content-security-policy', 'sandbox')
  response.setHeader('x-content-type-options', 'nosniff')
  streamFile(link.file, stats.size, request, response)
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
  if (slash === -1 || rest.slice(0, slash) !== browseToken) {
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
  const stats = statSync(file, { throwIfNoEntry: false })
  if (stats === undefined || !stats.isFile()) {
    response.statusCode = 404
    response.end(`${file} is not a file`)
    return
  }
  response.setHeader('content-type', browseType(file))
  response.setHeader('cache-control', 'no-cache')
  streamFile(file, stats.size, request, response)
}

function browseType(file: string) {
  const known = browseTypes.get(path.extname(file).toLowerCase())
  if (known !== undefined) {
    return known
  }
  const head = Buffer.alloc(SNIFF_LENGTH)
  const handle = openSync(file, 'r')
  const read = readSync(handle, head, 0, SNIFF_LENGTH, 0)
  closeSync(handle)
  return head.subarray(0, read).includes(0)
    ? 'application/octet-stream'
    : 'text/plain; charset=utf-8'
}

async function answerOpen(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== 'POST') {
    response.statusCode = 405
    response.end('use POST')
    return
  }
  let body = ''
  for await (const chunk of request) {
    body += chunk
  }
  let parsed
  try {
    parsed = openBody.parse(JSON.parse(body))
  } catch {
    response.statusCode = 400
    response.end('expected { path }')
    return
  }
  if (clients.size === 0) {
    response.statusCode = 409
    response.end('no browser is connected to OffSite')
    return
  }
  broadcast({ type: 'open', path: parsed.path })
  response.statusCode = 204
  response.end()
}

function streamFile(
  file: string,
  size: number,
  request: IncomingMessage,
  response: ServerResponse
) {
  response.setHeader('accept-ranges', 'bytes')
  if (request.headers.range === undefined) {
    response.setHeader('content-length', size)
    createReadStream(file)
      .on('error', () => response.destroy())
      .pipe(response)
    return
  }
  const range = byteRange(request.headers.range, size)
  if (range === null) {
    response.statusCode = 416
    response.setHeader('content-range', `bytes */${size}`)
    response.end()
    return
  }
  response.statusCode = 206
  response.setHeader(
    'content-range',
    `bytes ${range.start}-${range.end}/${size}`
  )
  response.setHeader('content-length', range.end - range.start + 1)
  createReadStream(file, range)
    .on('error', () => response.destroy())
    .pipe(response)
}

function byteRange(header: string, size: number) {
  const match = /^bytes=(?:(\d+)-(\d*)|-(\d+))$/.exec(header)
  if (match === null) {
    return null
  }
  if (match[3] !== undefined) {
    if (size === 0 || Number(match[3]) === 0) {
      return null
    }
    return { start: Math.max(size - Number(match[3]), 0), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (start > end) {
    return null
  }
  return { start, end }
}

function answerJson(response: ServerResponse, body: unknown) {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify(body))
}

function redeemTicket(ticket: string | null) {
  if (ticket === null) {
    return null
  }
  const found = tickets.get(ticket)
  tickets.delete(ticket)
  if (found === undefined || found.expiresAt <= Date.now()) {
    return null
  }
  return found.device
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

function serveFile(pathname: string, response: ServerResponse) {
  if (!args.pwa && pathname === '/manifest.webmanifest') {
    response.statusCode = 404
    response.end('offsite runs without --pwa')
    return
  }
  const requested = path.join(publicDir, path.normalize(pathname))
  const file =
    requested.startsWith(publicDir + path.sep) &&
    statSync(requested, { throwIfNoEntry: false })?.isFile()
      ? requested
      : path.join(publicDir, 'index.html')
  if (!existsSync(file)) {
    response.statusCode = 404
    response.end('web app not built; run pnpm build')
    return
  }
  response.setHeader(
    'content-type',
    contentTypes[path.extname(file)] ?? 'application/octet-stream'
  )
  if (!args.pwa && path.basename(file) === 'index.html') {
    response.end(
      readFileSync(file, 'utf8').replace(/<link rel="manifest"[^>]*>/, '')
    )
    return
  }
  createReadStream(file).pipe(response)
}
