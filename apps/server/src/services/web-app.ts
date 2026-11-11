import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { createGzip } from 'node:zlib'
import { args, serverDir } from '../args.ts'

export const publicDir = path.join(serverDir, '..', 'client', 'dist')

export const contentTypes: Record<string, string> = {
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

const compressible = new Set(['.js', '.css', '.svg', '.json', '.wasm', '.ttf'])

export function serveFile(
  pathname: string,
  request: IncomingMessage,
  response: ServerResponse
) {
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
  if (file !== requested && pathname.startsWith('/assets/')) {
    response.statusCode = 404
    response.end('not found')
    return
  }
  if (!existsSync(file)) {
    response.statusCode = 404
    response.end('web app not built; run pnpm build')
    return
  }
  response.setHeader(
    'content-type',
    contentTypes[path.extname(file)] ?? 'application/octet-stream'
  )
  if (path.basename(file) === 'index.html') {
    response.setHeader('cache-control', 'no-cache')
    let page = readFileSync(file, 'utf8')
    if (!args.pwa) {
      page = page.replace(/<link rel="manifest"[^>]*>/, '')
    }
    if (args.connect !== null) {
      page = page.replace(
        '</head>',
        `<meta name="offsite-connect" content="${args.connect.join(' ')}"></head>`
      )
    }
    response.end(page)
    return
  }
  if (file === requested && pathname.startsWith('/assets/')) {
    response.setHeader('cache-control', 'public, max-age=31536000, immutable')
  }
  if (pathname === '/sw.js') {
    response.setHeader('cache-control', 'no-cache')
  }
  if (compressible.has(path.extname(file))) {
    response.setHeader('vary', 'accept-encoding')
    const accepted = request.headers['accept-encoding'] ?? ''
    if (/\bbr\b/.test(accepted) && existsSync(`${file}.br`)) {
      response.setHeader('content-encoding', 'br')
      createReadStream(`${file}.br`).pipe(response)
      return
    }
    if (/\bgzip\b/.test(accepted)) {
      response.setHeader('content-encoding', 'gzip')
      if (existsSync(`${file}.gz`)) {
        createReadStream(`${file}.gz`).pipe(response)
        return
      }
      createReadStream(file).pipe(createGzip()).pipe(response)
      return
    }
  }
  createReadStream(file).pipe(response)
}
