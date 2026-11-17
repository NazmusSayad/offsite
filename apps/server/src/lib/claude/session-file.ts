import { type FileHandle, open, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  getSessionMessages,
  type SessionMessage,
  type SessionStoreEntry,
} from '@anthropic-ai/claude-agent-sdk'
import { claudeBaseDir } from '../../storage/config.ts'
import { logger } from '../log.ts'

const CACHED_SESSIONS = 5
const FIRST_WINDOW = 4 * 1024 * 1024
const MARK_LENGTH = 64
const NEWLINE = 10

export type Session = {
  ino: number
  mtimeMs: number
  size: number
  start: number
  end: number
  mark: Buffer
  committed: number
  entries: SessionStoreEntry[]
  offsets: number[]
  pages: { before: number; disk: SessionMessage[] }[]
}

const cache = new Map<string, Promise<Session>>()
const log = logger.withTag('claude')

async function sessionFile(sessionId: string) {
  const projectsDir = path.join(claudeBaseDir(), 'projects')
  for (const dir of await readdir(projectsDir)) {
    const file = path.join(projectsDir, dir, `${sessionId}.jsonl`)
    try {
      await stat(file)
      return file
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }
      throw error
    }
  }
  return null
}

export async function loadSession(sessionId: string, whole = false) {
  const file = await sessionFile(sessionId)
  if (file === null) {
    return null
  }
  const session = refreshAfter(cache.get(file), sessionId, file, whole)
  cache.delete(file)
  cache.set(file, session)
  if (cache.size > CACHED_SESSIONS) {
    const oldest = cache.keys().next()
    if (!oldest.done) {
      cache.delete(oldest.value)
      log.debug(
        `${path.basename(oldest.value, '.jsonl')} dropped from memory to keep ${CACHED_SESSIONS} threads`
      )
    }
  }
  return await session
}

async function refreshAfter(
  previous: Promise<Session> | undefined,
  sessionId: string,
  file: string,
  whole: boolean
) {
  let current: Session | null = null
  if (previous !== undefined) {
    try {
      current = await previous
    } catch {
      current = null
    }
  }
  const handle = await open(file, 'r')
  try {
    return await refresh(sessionId, handle, current, whole)
  } finally {
    await handle.close()
  }
}

async function refresh(
  sessionId: string,
  handle: FileHandle,
  current: Session | null,
  whole: boolean
) {
  const stats = await handle.stat()
  if (current === null) {
    return await readSession(sessionId, handle, whole, 'not in memory')
  }
  if (current.ino !== stats.ino) {
    return await readSession(sessionId, handle, whole, 'file was replaced')
  }
  if (whole && current.start !== 0) {
    return await readSession(sessionId, handle, whole, 'earlier pages needed')
  }
  if (current.mtimeMs === stats.mtimeMs && current.size === stats.size) {
    return current
  }
  if (stats.size < current.end) {
    return await readSession(sessionId, handle, whole, 'file got shorter')
  }
  if (!(await unchanged(handle, current))) {
    return await readSession(sessionId, handle, whole, 'file was rewritten')
  }
  const appended = await appendLines(sessionId, handle, current)
  return (
    appended ??
    (await readSession(
      sessionId,
      handle,
      whole,
      'new lines could not be added'
    ))
  )
}

async function unchanged(handle: FileHandle, session: Session) {
  const mark = await readRange(
    handle,
    session.end - session.mark.length,
    session.end
  )
  return mark.equals(session.mark)
}

async function readSession(
  sessionId: string,
  handle: FileHandle,
  whole: boolean,
  reason: string
): Promise<Session> {
  const began = performance.now()
  const stats = await handle.stat()
  const start = whole ? 0 : await latestStart(handle, stats.size)
  const buffer = await readRange(handle, start, stats.size)
  const lines = parseLines(buffer, start)
  const pages = await sessionPages(sessionId, lines.entries, start === 0)
  if (pages === null) {
    return await readSession(
      sessionId,
      handle,
      true,
      `latest part from byte ${start} was not complete`
    )
  }
  log.debug(
    `${sessionId} read ${megabytes(stats.size - start)} of ${megabytes(stats.size)} from byte ${start} in ${Math.round(performance.now() - began)}ms, ${pages.length} pages (${reason})`
  )
  return {
    ino: stats.ino,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    start,
    end: lines.end,
    mark: lines.mark,
    committed: lines.committed,
    entries: lines.entries,
    offsets: lines.offsets,
    pages,
  }
}

async function appendLines(
  sessionId: string,
  handle: FileHandle,
  current: Session
): Promise<Session | null> {
  const began = performance.now()
  const stats = await handle.stat()
  const lines = parseLines(
    await readRange(handle, current.end, stats.size),
    current.end
  )
  if (lines.entries.some(isBoundary)) {
    log.debug(`${sessionId} new lines have a compaction`)
    return null
  }
  const entries = [
    ...current.entries.slice(0, current.committed),
    ...lines.entries,
  ]
  const first = await sessionPages(sessionId, entries, current.start === 0, 1)
  if (first === null) {
    return null
  }
  if (!sameStart(current, entries, first[0].disk)) {
    log.debug(`${sessionId} new lines changed which messages show first`)
    return null
  }
  log.debug(
    `${sessionId} read ${stats.size - current.end} bytes of new lines in ${Math.round(performance.now() - began)}ms`
  )
  return {
    ino: stats.ino,
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    start: current.start,
    end: lines.end,
    mark: lines.end > current.end ? lines.mark : current.mark,
    committed: current.committed + lines.committed,
    entries,
    offsets: [...current.offsets.slice(0, current.committed), ...lines.offsets],
    pages: [...first, ...current.pages.slice(1)],
  }
}

function sameStart(
  current: Session,
  entries: SessionStoreEntry[],
  disk: SessionMessage[]
) {
  const shown = new Set(disk.map((item) => item.uuid))
  const previous = new Set(current.pages[0].disk.map((item) => item.uuid))
  return (
    compactedBefore(entries, disk[0]?.uuid) ===
      compactedBefore(current.entries, current.pages[0].disk[0]?.uuid) &&
    current.pages[0].disk.every((item) => shown.has(item.uuid)) &&
    current.pages
      .slice(1)
      .every((page) =>
        page.disk.every(
          (item) => previous.has(item.uuid) || !shown.has(item.uuid)
        )
      )
  )
}

async function sessionPages(
  sessionId: string,
  entries: SessionStoreEntry[],
  whole: boolean,
  limit = Infinity
) {
  const pages: Session['pages'] = []
  const seen = new Set<string>()
  let before: number | null = entries.length
  while (before !== null && pages.length < limit) {
    const kept = entries.slice(0, before)
    const disk = await getSessionMessages(sessionId, {
      sessionStore: { append: () => Promise.resolve(), load: async () => kept },
    })
    if (!whole && pages.length === 0 && !reachesStart(entries, disk)) {
      log.debug(`${sessionId} messages point to lines before the latest part`)
      return null
    }
    if (
      !whole &&
      pages.length === 0 &&
      compactedBefore(entries, disk[0]?.uuid) === null
    ) {
      log.debug(`${sessionId} no compaction before the first shown message`)
      return null
    }
    pages.push({ before, disk: disk.filter((item) => !seen.has(item.uuid)) })
    for (const item of disk) {
      seen.add(item.uuid)
    }
    before = whole ? compactedBefore(entries, disk[0]?.uuid) : null
  }
  return pages
}

function reachesStart(entries: SessionStoreEntry[], disk: SessionMessage[]) {
  const parents = new Map<unknown, unknown>(
    entries.map((entry) => [entry.uuid, entry.parentUuid])
  )
  const checked = new Set<unknown>()
  for (const item of disk) {
    let uuid: unknown = item.uuid
    while (!checked.has(uuid)) {
      checked.add(uuid)
      const parent = parents.get(uuid)
      if (typeof parent !== 'string') {
        break
      }
      if (!parents.has(parent)) {
        if (uuid !== entries[0]?.uuid) {
          return false
        }
        break
      }
      uuid = parent
    }
  }
  return true
}

export function compactedBefore(
  entries: SessionStoreEntry[],
  uuid: string | undefined
) {
  if (uuid === undefined) {
    return null
  }
  const start = entries.findIndex((entry) => entry.uuid === uuid)
  const index = entries.findLastIndex(
    (entry, position) => position < start && isBoundary(entry)
  )
  return index < 0 ? null : index
}

function isBoundary(entry: SessionStoreEntry | Record<string, unknown>) {
  return entry.type === 'system' && entry.subtype === 'compact_boundary'
}

async function latestStart(handle: FileHandle, size: number) {
  let length = Math.min(size, FIRST_WINDOW)
  while (true) {
    const from = size - length
    const found = latestPart(await readRange(handle, from, size), from === 0)
    if (found !== null) {
      return from + found
    }
    if (from === 0) {
      return 0
    }
    length = Math.min(size, length * 2)
  }
}

function latestPart(buffer: Buffer, complete: boolean) {
  let search = buffer.length
  while (search > 0) {
    const at = buffer.lastIndexOf('"compact_boundary"', search - 1)
    if (at < 0) {
      return null
    }
    const line = lineAround(buffer, at)
    if (line.start === 0 && !complete) {
      return null
    }
    const entry = parseLine(buffer.toString('utf8', line.start, line.end))
    if (entry !== null && isBoundary(entry)) {
      const head = headUuid(entry)
      return head === null
        ? line.start
        : headStart(buffer, head, line.start, complete)
    }
    search = line.start
  }
  return null
}

function headStart(
  buffer: Buffer,
  head: string,
  boundary: number,
  complete: boolean
) {
  let search = boundary
  while (search > 0) {
    const at = buffer.lastIndexOf(head, search - 1)
    if (at < 0) {
      break
    }
    const line = lineAround(buffer, at)
    if (line.start === 0 && !complete) {
      return null
    }
    const entry = parseLine(buffer.toString('utf8', line.start, line.end))
    if (entry?.uuid === head) {
      return line.start
    }
    search = line.start
  }
  return complete ? 0 : null
}

function headUuid(entry: Record<string, unknown>) {
  const metadata = entry.compactMetadata
  if (typeof metadata !== 'object' || metadata === null) {
    return null
  }
  const segment = (metadata as Record<string, unknown>).preservedSegment
  if (typeof segment !== 'object' || segment === null) {
    return null
  }
  const head = (segment as Record<string, unknown>).headUuid
  return typeof head === 'string' ? head : null
}

function lineAround(buffer: Buffer, at: number) {
  const end = buffer.indexOf(NEWLINE, at)
  return {
    start: buffer.lastIndexOf(NEWLINE, at) + 1,
    end: end < 0 ? buffer.length : end,
  }
}

function parseLines(buffer: Buffer, base: number) {
  const entries: SessionStoreEntry[] = []
  const offsets: number[] = []
  let committed = 0
  let end = 0
  let position = 0
  while (position < buffer.length) {
    const newline = buffer.indexOf(NEWLINE, position)
    const entry = parseLine(
      buffer.toString('utf8', position, newline < 0 ? buffer.length : newline)
    )
    if (entry !== null && typeof entry.type === 'string') {
      entries.push({ ...entry, type: entry.type })
      offsets.push(base + position)
    }
    if (newline < 0) {
      break
    }
    committed = entries.length
    position = newline + 1
    end = position
  }
  return {
    entries,
    offsets,
    committed,
    end: base + end,
    mark: Buffer.from(buffer.subarray(Math.max(0, end - MARK_LENGTH), end)),
  }
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

function megabytes(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

async function readRange(handle: FileHandle, from: number, to: number) {
  const buffer = Buffer.allocUnsafe(to - from)
  let filled = 0
  while (filled < buffer.length) {
    const result = await handle.read(
      buffer,
      filled,
      buffer.length - filled,
      from + filled
    )
    if (result.bytesRead === 0) {
      break
    }
    filled += result.bytesRead
  }
  return buffer.subarray(0, filled)
}
