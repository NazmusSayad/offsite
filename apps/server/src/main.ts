import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { args } from './args.ts'
import { findClaude } from './claude.ts'
import { readConfig } from './config.ts'
import { startPush } from './push.ts'
import { stopAll } from './runs.ts'
import { watchSessions } from './sessions.ts'
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

const port = Number(args.port)
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`invalid port ${args.port}`)
  process.exit(1)
}

process.env.CLAUDE_CONFIG_DIR = readConfig().claudeBaseDir
watchSessions()

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

server.listen(port, args.host, () => {
  startPush(`${args.host}:${port}`)
  console.log(`offsite is running at http://${args.host}:${port}`)
})

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

function stop() {
  stopAll()
  process.exit(0)
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
