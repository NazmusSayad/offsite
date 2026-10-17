import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import path from 'node:path'
import { HOSTED_APP, PROTOCOL } from '@offsite/core/protocol'
import { consola } from 'consola'
import { renderUnicodeCompact } from 'uqr'
import { type WebSocket, WebSocketServer } from 'ws'
import { connectClient } from './api/socket.ts'
import { args } from './args.ts'
import { findClaude } from './lib/claude/index.ts'
import { startPush } from './services/push.ts'
import { stopAll } from './services/runs.ts'
import { refreshAll, watchSessions } from './services/sessions.ts'
import { readConfig, version } from './storage/config.ts'
import { machineInfo } from './storage/db.ts'
import { lockHome } from './storage/storage.ts'
import {
  addToken,
  hasTokens,
  matchesToken,
  readTokens,
  recordUse,
  removeTokens,
} from './storage/token.ts'

const UNPAIR_CHECK = 5000

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

const port = Number(args.port)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`invalid port ${args.port}`)
  process.exit(1)
}

const address = `http://${args.host}:${port}`

const fallback =
  args.fallback === undefined ? null : readFallback(args.fallback)

if (args.command === 'pair') {
  const links = pairingLinks(addToken(args.name))
  console.log(`Scan this to pair a phone with ${HOSTED_APP}:`)
  console.log('')
  console.log(renderUnicodeCompact(links.hosted, { border: 2 }))
  console.log('')
  console.log('Or open one of these links in the browser to pair:')
  console.log(`  ${links.hosted}`)
  console.log(`  ${links.local}`)
  if (fallback !== null) console.log(`Fallback: ${fallback}`)
  process.exit(0)
}

if (args.command === 'unpair') {
  await unpair()
  process.exit(0)
}

lockHome()

process.env.CLAUDE_CONFIG_DIR = readConfig().claudeBaseDir
watchSessions()
refreshAll()

if (findClaude() === null) {
  console.error('could not find claude on PATH; install Claude Code first')
  process.exit(1)
}

const publicDir = path.join(import.meta.dirname, '..', '..', 'web', 'dist')
const token = args.auth && args.pair && !hasTokens() ? addToken(null) : null

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname === '/version') {
    response.setHeader('access-control-allow-origin', '*')
    response.setHeader('content-type', 'application/json')
    response.end(
      JSON.stringify({
        version,
        protocol: PROTOCOL,
        machineId: machineInfo().id,
        authorized: authorized(url),
        serving:
          args.command === 'web' &&
          request.headers['sec-fetch-site'] === 'same-origin',
      })
    )
    return
  }
  if (args.command === 'serve') {
    response.statusCode = 404
    response.end(`offsite serve has no web app; open ${HOSTED_APP}`)
    return
  }
  serveFile(url.pathname, response)
})

const sockets = new WebSocketServer({ noServer: true })
const paired = new Map<WebSocket, string>()

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  const given = url.searchParams.get('token')
  if (
    url.pathname !== '/ws' ||
    url.searchParams.get('protocol') !== String(PROTOCOL) ||
    !authorized(url)
  ) {
    socket.destroy()
    return
  }
  sockets.handleUpgrade(request, socket, head, (client) => {
    connectClient(client)
    if (!args.auth || given === null) return
    paired.set(client, given)
    client.on('close', () => paired.delete(client))
    recordUse(given)
  })
})

if (args.auth)
  setInterval(() => {
    for (const [client, given] of paired)
      if (!matchesToken(given)) client.close()
  }, UNPAIR_CHECK)

server.listen(port, args.host, () => {
  startPush(`${args.host}:${port}`)
  if (args.pair && (token !== null || !args.auth)) {
    const links = pairingLinks(token)
    if (args.command === 'web')
      console.log(`offsite is running at ${links.local}`)
    console.log(`Open it on ${HOSTED_APP}: ${links.hosted}`)
  } else {
    console.log(`offsite is running at ${address}`)
    if (args.pair) console.log('Run offsite pair to pair another browser')
    else console.log(`Open it on ${HOSTED_APP}`)
  }
  if (!args.auth)
    console.warn(
      'auth is off; anyone who can reach this port can control this machine'
    )
})

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

function stop() {
  stopAll()
  process.exit(0)
}

function authorized(url: URL) {
  return !args.auth || matchesToken(url.searchParams.get('token'))
}

async function unpair() {
  const tokens = readTokens()
  if (tokens.length === 0) {
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
    options: tokens.map((item) => ({
      value: item.hash,
      label: [
        item.name ?? 'Unnamed',
        `paired ${new Date(item.createdAt).toLocaleString()}`,
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
  removeTokens(picked)
  console.log(
    `Unpaired ${picked.length} ${picked.length === 1 ? 'browser' : 'browsers'}; a running offsite disconnects them within seconds`
  )
}

function readFallback(link: string) {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    console.error(`invalid fallback URL ${link}`)
    process.exit(1)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    console.error(`the fallback URL ${link} needs http:// or https://`)
    process.exit(1)
  }
  return url.origin
}

function pairingLinks(token: string | null) {
  const hosted = new URLSearchParams({
    machine: address,
    ...(fallback !== null && { fallback }),
    ...(token !== null && { token }),
  })
  return {
    local:
      token === null
        ? address
        : `${address}/pair#${new URLSearchParams({ token })}`,
    hosted: `${HOSTED_APP}/pair#${hosted}`,
  }
}

function serveFile(pathname: string, response: ServerResponse) {
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
  createReadStream(file).pipe(response)
}
