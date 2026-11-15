import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import { pipeline } from 'node:stream/promises'
import { mediaTypes } from '@offsite/core/media'
import { isPaired } from '../storage/auth.ts'
import { gh } from './pull-requests.ts'

const ATTACHMENT_URL =
  /^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{36}$/i
const LINK_LIFETIME = 60 * 60_000
const LINK_REUSE = 30 * 60_000
const SIGNED_REUSE = 4 * 60_000
const SIGNED_URL =
  /src="(https:\/\/private-user-images\.githubusercontent\.com\/[^"]+)"/
const PASSED_HEADERS = ['content-length', 'content-range', 'accept-ranges']
type GithubLink = {
  url: string
  repository: string | null
  githubToken: string
  device: string | null
  createdAt: number
  signed: { url: string; at: number } | null
}
const links = new Map<string, GithubLink>()

export async function linkGithubImage(
  url: string,
  repository: string | null,
  device: string | null
) {
  if (!ATTACHMENT_URL.test(url)) {
    throw new Error(`${url} is not a GitHub attachment`)
  }
  for (const [token, link] of links) {
    if (Date.now() - link.createdAt >= LINK_LIFETIME) {
      links.delete(token)
      continue
    }
    if (
      link.url === url &&
      link.repository === repository &&
      link.device === device &&
      Date.now() - link.createdAt < LINK_REUSE
    ) {
      return token
    }
  }
  const githubToken = (await gh(os.homedir(), ['auth', 'token'])).trim()
  const token = randomBytes(32).toString('base64url')
  links.set(token, {
    url,
    repository,
    githubToken,
    device,
    createdAt: Date.now(),
    signed: null,
  })
  return token
}

export async function serveGithubMedia(
  token: string | null,
  request: IncomingMessage,
  response: ServerResponse
) {
  if (request.method !== 'GET') {
    response.statusCode = 405
    response.end('use GET')
    return
  }
  const link = token === null ? undefined : links.get(token)
  if (
    link === undefined ||
    Date.now() - link.createdAt >= LINK_LIFETIME ||
    (link.device !== null && !isPaired(link.device))
  ) {
    response.statusCode = 404
    response.end('This media link expired')
    return
  }
  const abort = new AbortController()
  response.on('close', () => abort.abort())
  try {
    const upstream = await fetchMedia(link, request.headers.range, abort.signal)
    if (upstream.status === 416) {
      response.statusCode = 416
      const range = upstream.headers.get('content-range')
      if (range !== null) {
        response.setHeader('content-range', range)
      }
      response.end()
      return
    }
    if (upstream.status !== 200 && upstream.status !== 206) {
      response.statusCode = 502
      response.end(`GitHub answered ${upstream.status} for ${link.url}`)
      return
    }
    const mediaType = upstream.headers.get('content-type')?.split(';')[0].trim()
    if (
      mediaType === undefined ||
      ![...mediaTypes.values()].includes(mediaType)
    ) {
      response.statusCode = 502
      response.end(
        `GitHub sent ${mediaType} for ${link.url}, which is not media`
      )
      return
    }
    response.statusCode = upstream.status
    response.setHeader('content-type', mediaType)
    for (const name of PASSED_HEADERS) {
      const value = upstream.headers.get(name)
      if (value !== null) {
        response.setHeader(name, value)
      }
    }
    response.setHeader('access-control-allow-origin', '*')
    response.setHeader('cache-control', 'private, max-age=3600')
    response.setHeader('content-security-policy', 'sandbox')
    response.setHeader('x-content-type-options', 'nosniff')
    if (upstream.body === null) {
      response.end()
      return
    }
    await pipeline(upstream.body, response)
  } catch {
    if (response.headersSent) {
      response.destroy()
      return
    }
    response.statusCode = 502
    response.end(`GitHub could not be reached for ${link.url}`)
  }
}

async function fetchMedia(
  link: GithubLink,
  range: string | undefined,
  signal: AbortSignal
) {
  const headers: Record<string, string> = range === undefined ? {} : { range }
  if (link.signed !== null && Date.now() - link.signed.at < SIGNED_REUSE) {
    const signed = await fetch(link.signed.url, { headers, signal })
    if (
      signed.status === 200 ||
      signed.status === 206 ||
      signed.status === 416
    ) {
      return signed
    }
    await signed.body?.cancel()
  }
  const direct = await fetch(link.url, {
    headers: { ...headers, authorization: `token ${link.githubToken}` },
    signal,
  })
  if (
    link.repository === null ||
    direct.headers.get('content-type')?.split(';')[0].trim() !== 'text/html'
  ) {
    return direct
  }
  const signedUrl = await renderSignedUrl(link, link.repository, signal)
  if (signedUrl === null) {
    return direct
  }
  await direct.body?.cancel()
  link.signed = { url: signedUrl, at: Date.now() }
  return await fetch(signedUrl, { headers, signal })
}

async function renderSignedUrl(
  link: GithubLink,
  repository: string,
  signal: AbortSignal
) {
  const rendered = await fetch('https://api.github.com/markdown', {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `token ${link.githubToken}`,
    },
    body: JSON.stringify({
      text: `![](${link.url})`,
      mode: 'gfm',
      context: repository,
    }),
    signal,
  })
  if (!rendered.ok) {
    return null
  }
  const match = SIGNED_URL.exec(await rendered.text())
  return match === null ? null : match[1].replaceAll('&amp;', '&')
}
