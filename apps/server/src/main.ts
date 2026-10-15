import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { WebSocketServer } from 'ws'
import { findClaude } from './claude.ts'
import { startPush } from './push.ts'
import { stopAll } from './runs.ts'
import { connectClient } from './socket.ts'

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

const { values } = parseArgs({
  options: {
    host: { type: 'string', default: '127.0.0.1' },
    port: { type: 'string', default: '47841' },
  },
})
const port = Number(values.port)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`invalid port ${values.port}`)
  process.exit(1)
}

if (findClaude() === null) {
  console.error('could not find claude on PATH; install Claude Code first')
  process.exit(1)
}

const publicDir = path.join(import.meta.dirname, '..', '..', 'web', 'dist')

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  serveFile(url.pathname, response)
})

const sockets = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname === '/ws')
    sockets.handleUpgrade(request, socket, head, connectClient)
  else socket.destroy()
})

server.listen(port, values.host, () => {
  startPush(`${values.host}:${port}`)
  console.log(`offsite is running at http://${values.host}:${port}`)
})

process.on('SIGINT', () => {
  stopAll()
  process.exit(0)
})

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
