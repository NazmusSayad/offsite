import { once } from 'node:events'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import https from 'node:https'
import { isIP, type Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import zlib from 'node:zlib'
import { z } from 'zod'
import { rewriteCss } from './css.ts'
import { rewriteHtml } from './html.ts'
import { pageScript } from './page-script.ts'
import { rewriteScript } from './script.ts'
import {
  checkAddress,
  findSite,
  guardedLookup,
  hostOf,
  linkRewriter,
  proxiedPath,
  type Site,
} from './sites.ts'

const ROUTE = /^\/api\/proxy\/([^/]+)\/(.*)$/
const TARGET = /^(https?)\/([^/?#]+)(.*)$/
const SANDBOX =
  'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-presentation allow-pointer-lock'
const UPSTREAM_TIMEOUT = 60_000
const MAX_BODY = 8 * 1024 * 1024
const MAX_PAGE = 32 * 1024 * 1024
const MAX_HEADERS = 256 * 1024
const REQUEST_HEADERS_DROPPED = new Set([
  'accept-encoding',
  'cdn-loop',
  'connection',
  'cookie',
  'forwarded',
  'host',
  'keep-alive',
  'origin',
  'proxy-authorization',
  'proxy-connection',
  'referer',
  'sec-fetch-site',
  'sec-fetch-user',
  'te',
  'trailer',
  'transfer-encoding',
  'true-client-ip',
  'upgrade',
  'via',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-real-ip',
])
const RESPONSE_HEADERS_DROPPED = new Set([
  'alt-svc',
  'clear-site-data',
  'connection',
  'content-security-policy',
  'content-security-policy-report-only',
  'expect-ct',
  'feature-policy',
  'keep-alive',
  'link',
  'location',
  'nel',
  'origin-agent-cluster',
  'permissions-policy',
  'public-key-pins',
  'referrer-policy',
  'refresh',
  'report-to',
  'reporting-endpoints',
  'service-worker-allowed',
  'set-cookie',
  'strict-transport-security',
  'trailer',
  'transfer-encoding',
  'x-frame-options',
])
const pageWrite = z.object({ url: z.string(), cookie: z.string() })
const storageWrite = z.object({
  origin: z.string(),
  data: z.record(z.string(), z.string()),
})

export function serveProxy(request: IncomingMessage, response: ServerResponse) {
  answerProxy(request, response).catch((error: unknown) => {
    fail(response, 502, error instanceof Error ? error.message : String(error))
  })
}

async function answerProxy(request: IncomingMessage, response: ServerResponse) {
  const route = ROUTE.exec(request.url ?? '')
  const site = route === null ? null : findSite(route[1] ?? '')
  response.setHeader(
    'access-control-allow-origin',
    request.headers.origin ?? '*'
  )
  response.setHeader('access-control-allow-credentials', 'true')
  response.setHeader('access-control-expose-headers', '*')
  if (route === null || site === null) {
    fail(response, 404, 'This page expired. Press reload to open it again.')
    return
  }
  response.setHeader('content-security-policy', pagePolicy(site, request))
  response.setHeader('referrer-policy', 'unsafe-url')
  if (request.method === 'OPTIONS') {
    response.setHeader(
      'access-control-allow-methods',
      request.headers['access-control-request-method'] ?? '*'
    )
    response.setHeader(
      'access-control-allow-headers',
      request.headers['access-control-request-headers'] ?? '*'
    )
    response.statusCode = 204
    response.end()
    return
  }
  const rest = route[2] ?? ''
  if (rest.startsWith('runtime.js')) {
    serveRuntime(site, rest, response)
    return
  }
  if (rest === 'cookie' || rest === 'storage') {
    await savePageData(site, rest, request, response)
    return
  }
  const target = readTarget(rest)
  if (target === null) {
    fail(response, 404, 'not found')
    return
  }
  await forward(site, target, request, response)
}

export function proxySocket(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer
) {
  socket.on('error', () => socket.destroy())
  try {
    connectSocket(request, socket, head)
  } catch {
    socket.destroy()
  }
}

function connectSocket(request: IncomingMessage, socket: Duplex, head: Buffer) {
  const route = ROUTE.exec(request.url ?? '')
  const site = route === null ? null : findSite(route[1] ?? '')
  const target = route === null ? null : readTarget(route[2] ?? '')
  if (site === null || target === null) {
    socket.destroy()
    return
  }
  const headers = upstreamHeaders(site, target, request)
  headers.connection = 'Upgrade'
  headers.upgrade = request.headers.upgrade
  const upstream = openUpstream(site, target, request, headers)
  upstream.on('upgrade', (answer, remote, remoteHead) => {
    const lines = [`HTTP/1.1 101 ${answer.statusMessage}`]
    for (let index = 0; index < answer.rawHeaders.length; index += 2) {
      lines.push(`${answer.rawHeaders[index]}: ${answer.rawHeaders[index + 1]}`)
    }
    socket.write(`${lines.join('\r\n')}\r\n\r\n`)
    if (remoteHead.length > 0) {
      socket.write(remoteHead)
    }
    if (head.length > 0) {
      remote.write(head)
    }
    remote.on('error', () => socket.destroy())
    socket.on('close', () => remote.destroy())
    remote.pipe(socket).pipe(remote)
  })
  upstream.on('response', () => socket.destroy())
  upstream.on('error', () => socket.destroy())
  upstream.end()
}

async function forward(
  site: Site,
  target: URL,
  request: IncomingMessage,
  response: ServerResponse
) {
  const headers = upstreamHeaders(site, target, request)
  headers['accept-encoding'] = 'gzip, deflate, br'
  const upstream = openUpstream(site, target, request, headers)
  response.on('close', () => upstream.destroy())
  const answer = once(upstream, 'response') as Promise<[IncomingMessage]>
  upstream.on('error', () => undefined)
  request.pipe(upstream)
  const incoming = (await answer)[0]
  upstream.setTimeout(0)
  const status = incoming.statusCode
  if (status === undefined || status < 200 || status > 999) {
    throw new Error(`${target.origin} sent an invalid status`)
  }
  for (const cookie of incoming.headers['set-cookie'] ?? []) {
    await site.jar.setCookie(cookie, target.href, { ignoreError: true })
  }
  const kind = rewriteKind(incoming, request)
  response.statusCode = status
  copyHeaders(incoming, response, kind !== null)
  const location = incoming.headers.location
  if (location !== undefined) {
    const next = URL.parse(location, target)
    if (next === null) {
      throw new Error(`${target.origin} sent a bad redirect`)
    }
    response.setHeader('location', proxiedPath(site.key, next))
  }
  if (kind === null) {
    response.flushHeaders()
    await pipeline(incoming, response)
    return
  }
  const text = decodeBody(await readBody(incoming), incoming)
  response.setHeader('content-type', contentType(kind))
  response.end(await rewriteBody(site, target, kind, text))
}

function openUpstream(
  site: Site,
  target: URL,
  request: IncomingMessage,
  headers: http.OutgoingHttpHeaders
) {
  const secure = target.protocol === 'https:'
  const port = Number(target.port) || (secure ? 443 : 80)
  const ownPort = (request.socket as Socket).localPort ?? 0
  const hostname = hostOf(target)
  if (target.host === request.headers.host) {
    throw new Error('Pages cannot reach Offsite itself')
  }
  if (isIP(hostname) !== 0) {
    checkAddress(site, hostname, port, ownPort)
  }
  const client = secure ? https : http
  const upstream = client.request(target, {
    method: request.method,
    headers,
    lookup: guardedLookup(site, port, ownPort),
    maxHeaderSize: MAX_HEADERS,
    timeout: UPSTREAM_TIMEOUT,
    rejectUnauthorized: !site.local,
  })
  upstream.on('timeout', () =>
    upstream.destroy(new Error(`${target.host} took too long to answer`))
  )
  return upstream
}

function upstreamHeaders(site: Site, target: URL, request: IncomingMessage) {
  const headers: http.OutgoingHttpHeaders = {}
  for (const name of Object.keys(request.headers)) {
    if (!REQUEST_HEADERS_DROPPED.has(name) && !name.startsWith('cf-')) {
      headers[name] = request.headers[name]
    }
  }
  headers.host = target.host
  const cookie = site.jar.getCookieStringSync(target.href)
  if (cookie !== '') {
    headers.cookie = cookie
  }
  const referer = refererOf(site, request)
  if (referer !== null) {
    headers.referer = referer
  } else if (request.method !== 'GET' && request.method !== 'HEAD') {
    headers.referer = `${target.origin}/`
  }
  if (request.headers.origin !== undefined) {
    headers.origin = referer === null ? target.origin : new URL(referer).origin
  }
  return headers
}

function refererOf(site: Site, request: IncomingMessage) {
  const referer = request.headers.referer
  const prefix = `/api/proxy/${site.key}/`
  if (referer === undefined || !referer.includes(prefix)) {
    return null
  }
  const target = readTarget(
    referer.slice(referer.indexOf(prefix) + prefix.length)
  )
  return target?.href ?? null
}

function readTarget(rest: string) {
  const match = TARGET.exec(rest)
  if (match === null) {
    return null
  }
  return URL.parse(`${match[1]}://${match[2]}${match[3]}`)
}

function pagePolicy(site: Site, request: IncomingMessage) {
  const host = request.headers.host
  if (host === undefined) {
    throw new Error('the request has no host')
  }
  const sources = ['http', 'https', 'ws', 'wss']
    .map((scheme) => `${scheme}://${host}/api/proxy/${site.key}/`)
    .join(' ')
  return `${SANDBOX}; default-src ${sources} 'unsafe-inline' 'unsafe-eval' data: blob:; form-action ${sources}; base-uri ${sources}`
}

function rewriteKind(incoming: IncomingMessage, request: IncomingMessage) {
  if (request.headers['sec-fetch-dest'] === 'empty') {
    return null
  }
  const type = incoming.headers['content-type']?.split(';')[0]?.trim() ?? ''
  if (type === 'text/html' || type === 'application/xhtml+xml') {
    return 'html'
  }
  if (type === 'text/css') {
    return 'css'
  }
  if (/\b(java|ecma)script\b/.test(type)) {
    return 'script'
  }
  return null
}

function contentType(kind: 'html' | 'css' | 'script') {
  if (kind === 'html') {
    return 'text/html; charset=utf-8'
  }
  if (kind === 'css') {
    return 'text/css; charset=utf-8'
  }
  return 'text/javascript; charset=utf-8'
}

async function rewriteBody(
  site: Site,
  target: URL,
  kind: 'html' | 'css' | 'script',
  text: string
) {
  const rewrite = linkRewriter(site.key, target)
  if (kind === 'css') {
    return rewriteCss(text, rewrite)
  }
  if (kind === 'script') {
    return rewriteScript(text, rewrite, `${site.key} ${target.origin}`)
  }
  const script = pageScript({
    key: site.key,
    url: target.href,
    cookies: site.jar.getCookieStringSync(target.href, { http: false }),
    storage: site.storage.get(target.origin) ?? {},
    origin: null,
  })
  return rewriteHtml(text, site.key, target, script)
}

function copyHeaders(
  incoming: IncomingMessage,
  response: ServerResponse,
  rewritten: boolean
) {
  for (const name of Object.keys(incoming.headers)) {
    const value = incoming.headers[name]
    if (
      value === undefined ||
      RESPONSE_HEADERS_DROPPED.has(name) ||
      name.startsWith('access-control-') ||
      name.startsWith('cross-origin-')
    ) {
      continue
    }
    if (
      rewritten &&
      (name === 'content-length' ||
        name === 'content-encoding' ||
        name === 'content-md5' ||
        name === 'etag')
    ) {
      continue
    }
    response.setHeader(name, value)
  }
  if (rewritten) {
    const cache = incoming.headers['cache-control']
    response.setHeader(
      'cache-control',
      cache === undefined ? 'no-transform' : `${cache}, no-transform`
    )
  }
}

async function readBody(incoming: IncomingMessage) {
  const encoding = incoming.headers['content-encoding']
  if (encoding === undefined || encoding === 'identity') {
    return readLimited(incoming, MAX_PAGE)
  }
  const decoder = createDecoder(encoding)
  const results = await Promise.all([
    readLimited(decoder, MAX_PAGE),
    pipeline(incoming, decoder),
  ])
  return results[0]
}

function createDecoder(encoding: string) {
  if (encoding === 'gzip') {
    return zlib.createGunzip()
  }
  if (encoding === 'deflate') {
    return zlib.createInflate()
  }
  if (encoding === 'br') {
    return zlib.createBrotliDecompress()
  }
  throw new Error(`the site sent unknown compression: ${encoding}`)
}

async function readLimited(source: AsyncIterable<Buffer>, limit: number) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of source) {
    size += chunk.length
    if (size > limit) {
      throw new Error('This page is too large')
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

function decodeBody(body: Buffer, incoming: IncomingMessage) {
  const declared =
    /charset=["']?([\w-]+)/i.exec(
      incoming.headers['content-type'] ?? ''
    )?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(
      body.subarray(0, 1024).toString('latin1')
    )?.[1] ??
    'utf-8'
  try {
    return new TextDecoder(declared).decode(body)
  } catch {
    return new TextDecoder('utf-8').decode(body)
  }
}

function serveRuntime(site: Site, rest: string, response: ServerResponse) {
  const query = new URL(rest, 'http://localhost').searchParams
  const url = query.get('url')
  const origin = query.get('origin')
  if (url === null || origin === null) {
    fail(response, 400, 'the runtime needs a url and an origin')
    return
  }
  response.setHeader('content-type', 'text/javascript; charset=utf-8')
  response.end(
    pageScript({ key: site.key, url, cookies: '', storage: {}, origin })
  )
}

async function savePageData(
  site: Site,
  kind: 'cookie' | 'storage',
  request: IncomingMessage,
  response: ServerResponse
) {
  if (request.method !== 'POST') {
    fail(response, 405, 'use POST')
    return
  }
  const body = await readLimited(request, MAX_BODY)
  const data: unknown = JSON.parse(body.toString())
  if (kind === 'cookie') {
    const write = pageWrite.parse(data)
    await site.jar.setCookie(write.cookie, write.url, {
      ignoreError: true,
      http: false,
    })
  }
  if (kind === 'storage') {
    const write = storageWrite.parse(data)
    site.storage.set(write.origin, write.data)
  }
  response.statusCode = 204
  response.end()
}

function fail(response: ServerResponse, status: number, message: string) {
  if (response.headersSent) {
    response.destroy()
    return
  }
  response.statusCode = status
  response.setHeader('content-type', 'text/plain; charset=utf-8')
  response.end(message)
}
