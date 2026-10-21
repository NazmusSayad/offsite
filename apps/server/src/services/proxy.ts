import http from 'node:http'
import { createProxyServer } from 'http-proxy-3'
import type { ProxyResponse } from 'http-proxy-3/dist/lib/http-proxy/passes/web-incoming.js'
import { OUTGOING_PASSES } from 'http-proxy-3/dist/lib/http-proxy/passes/web-outgoing.js'
import { args } from '../args.ts'

const proxies = new Map<string, Promise<number>>()

const pageScriptPath = '/__offsite/browser.js'

function pageScript(origin: string) {
  return `(() => {
  if (window.parent === window || window.navigation === undefined) {
    return
  }
  const post = (message) =>
    window.parent.postMessage({ offsite: 'browser', ...message }, '*')
  const report = () =>
    post({
      event: 'location',
      url: ${JSON.stringify(origin)} + location.pathname + location.search + location.hash,
      proxied: location.href,
      back: navigation.canGoBack,
      forward: navigation.canGoForward,
    })
  addEventListener('pageshow', report)
  navigation.addEventListener('currententrychange', report)
  navigation.addEventListener('navigate', (event) => {
    if (!event.destination.sameDocument && event.downloadRequest === null) {
      post({ event: 'navigate' })
    }
  })
  addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.offsite !== 'browser') {
      return
    }
    if (event.data.command === 'back') {
      navigation.back()
    }
    if (event.data.command === 'forward') {
      navigation.forward()
    }
    if (event.data.command === 'reload') {
      location.reload()
    }
  })
})()
`
}

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
  const options = {
    target,
    changeOrigin: true,
    ws: true,
    secure: false,
    autoRewrite: true,
    protocolRewrite: 'http',
    cookieDomainRewrite: '',
    selfHandleResponse: true,
  }
  const proxy = createProxyServer(options)
  proxy.on('proxyReq', (outgoing, request) => {
    rewriteOrigin(target, outgoing, request)
    if (request.headers.accept?.startsWith('text/html') === true) {
      outgoing.removeHeader('accept-encoding')
    }
  })
  proxy.on('proxyReqWs', (outgoing, request) =>
    rewriteOrigin(target, outgoing, request)
  )
  proxy.on('proxyRes', async (incoming, request, response) => {
    try {
      await rewriteRedirect(target, incoming, request)
    } catch (error) {
      response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(
        `Could not follow the redirect from ${target.origin}: ${error instanceof Error ? error.message : String(error)}`
      )
      return
    }
    delete incoming.headers['x-frame-options']
    delete incoming.headers['content-security-policy']
    if (incoming.headers['set-cookie'] !== undefined) {
      incoming.headers['set-cookie'] = incoming.headers['set-cookie'].map(
        (cookie) =>
          cookie.replace(/;\s*secure/i, '').replace(/;\s*samesite=none/i, '')
      )
    }
    const page =
      request.method === 'GET' &&
      request.headers.accept?.startsWith('text/html') === true &&
      incoming.statusCode !== 204 &&
      incoming.statusCode !== 304 &&
      /^text\/html/i.test(incoming.headers['content-type'] ?? '') &&
      incoming.headers['content-encoding'] === undefined
    if (page) {
      delete incoming.headers['content-length']
    }
    for (const pass of Object.values(OUTGOING_PASSES)) {
      pass(request, response, incoming as ProxyResponse, options)
    }
    if (!page) {
      incoming.pipe(response)
      return
    }
    const chunks: Buffer[] = []
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
    incoming.on('end', () =>
      response.end(
        Buffer.from(
          Buffer.concat(chunks)
            .toString('latin1')
            .replace(
              /^(\xEF\xBB\xBF)?\s*(<!doctype[^>]*>)?/i,
              `$&<script src="${pageScriptPath}"></script>`
            ),
          'latin1'
        )
      )
    )
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
  const server = http.createServer((request, response) => {
    if (request.url === pageScriptPath) {
      response.writeHead(200, {
        'content-type': 'text/javascript; charset=utf-8',
      })
      response.end(pageScript(target.origin))
      return
    }
    proxy.web(request, response)
  })
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

async function rewriteRedirect(
  target: URL,
  incoming: http.IncomingMessage,
  request: http.IncomingMessage
) {
  const location = incoming.headers.location
  if (
    location === undefined ||
    !/^30[1278]$/.test(String(incoming.statusCode))
  ) {
    return
  }
  const next = new URL(location, target)
  if (
    next.origin === target.origin ||
    (next.protocol !== 'http:' && next.protocol !== 'https:')
  ) {
    return
  }
  if (request.headers.host === undefined) {
    throw new Error('the redirected request has no host')
  }
  const proxied = new URL(`http://${request.headers.host}`)
  proxied.port = String(await proxyPort(next.origin))
  incoming.headers.location = `${proxied.origin}${next.pathname}${next.search}${next.hash}`
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
