import type { IncomingMessage } from 'node:http'
import { pipeline } from 'node:stream/promises'
import zlib from 'node:zlib'

const MAX_PAGE = 32 * 1024 * 1024

export async function readBody(incoming: IncomingMessage) {
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

export function createDecoder(encoding: string) {
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

export async function readLimited(
  source: AsyncIterable<Buffer>,
  limit: number
) {
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

export function decodeBody(body: Buffer, incoming: IncomingMessage) {
  return textDecoder(body, incoming).decode(body)
}

export async function* decodeHtml(
  source: AsyncIterable<Buffer>,
  incoming: IncomingMessage
) {
  const declared = headerCharset(incoming)
  let head = Buffer.alloc(0)
  let decoder: TextDecoder | null = null
  for await (const chunk of source) {
    if (decoder !== null) {
      yield decoder.decode(chunk, { stream: true })
      continue
    }
    head = Buffer.concat([head, chunk])
    if (declared === null && head.length < 1024) {
      continue
    }
    decoder = textDecoder(head, incoming)
    yield decoder.decode(head, { stream: true })
  }
  if (decoder === null) {
    yield textDecoder(head, incoming).decode(head)
    return
  }
  yield decoder.decode()
}

function headerCharset(incoming: IncomingMessage) {
  return (
    /charset=["']?([\w-]+)/i.exec(
      incoming.headers['content-type'] ?? ''
    )?.[1] ?? null
  )
}

function textDecoder(head: Buffer, incoming: IncomingMessage) {
  const declared =
    headerCharset(incoming) ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(
      head.subarray(0, 1024).toString('latin1')
    )?.[1] ??
    'utf-8'
  try {
    return new TextDecoder(declared)
  } catch {
    return new TextDecoder('utf-8')
  }
}
