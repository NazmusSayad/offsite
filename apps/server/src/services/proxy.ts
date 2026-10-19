import http from 'node:http'
import { createProxyServer } from 'http-proxy-3'
import { args } from '../args.ts'

const proxies = new Map<string, Promise<number>>()

export function proxyPort(origin: string) {
  const target = new URL(origin)
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new Error(`${origin} is not an http or https address`)
  }
  const existing = proxies.get(target.origin)
  if (existing !== undefined) {
    return existing
  }
  const started = startProxy(target)
  proxies.set(target.origin, started)
  started.catch(() => proxies.delete(target.origin))
  return started
}

function startProxy(target: URL) {
  const proxy = createProxyServer({
    target: target.origin,
    changeOrigin: true,
    ws: true,
    secure: false,
    autoRewrite: true,
    protocolRewrite: 'http',
    cookieDomainRewrite: '',
  })
  proxy.on('proxyReq', (outgoing, request) =>
    rewriteOrigin(target, outgoing, request)
  )
  proxy.on('proxyReqWs', (outgoing, request) =>
    rewriteOrigin(target, outgoing, request)
  )
  proxy.on('proxyRes', (incoming) => {
    delete incoming.headers['x-frame-options']
    delete incoming.headers['content-security-policy']
    if (incoming.headers['set-cookie'] !== undefined) {
      incoming.headers['set-cookie'] = incoming.headers['set-cookie'].map(
        (cookie) =>
          cookie.replace(/;\s*secure/i, '').replace(/;\s*samesite=none/i, '')
      )
    }
  })
  proxy.on('error', (error, _request, response) => {
    if (!(response instanceof http.ServerResponse)) {
      response.destroy()
      return
    }
    if (!response.headersSent) {
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
    }
    response.end(`Could not reach ${target.origin}: ${error.message}`)
  })
  const server = http.createServer((request, response) =>
    proxy.web(request, response)
  )
  server.on('upgrade', (request, socket, head) =>
    proxy.ws(request, socket, head)
  )
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, args.host, () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error(`the proxy for ${target.origin} has no port`))
        return
      }
      resolve(address.port)
    })
  })
}

function rewriteOrigin(
  target: URL,
  outgoing: http.ClientRequest,
  request: http.IncomingMessage
) {
  if (request.headers.origin !== undefined) {
    outgoing.setHeader('origin', target.origin)
  }
  if (request.headers.referer !== undefined) {
    outgoing.setHeader(
      'referer',
      request.headers.referer.replace(
        `http://${request.headers.host}`,
        target.origin
      )
    )
  }
}
