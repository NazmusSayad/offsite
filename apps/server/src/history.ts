import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import {
  getSessionMessages,
  getSubagentMessages,
  type SessionMessage,
  type SessionStoreEntry,
} from '@anthropic-ai/claude-agent-sdk'
import { readConfig } from './config.ts'
import { contextTokens, type Message, toMessage } from './content.ts'
import { toItems } from './items.ts'
import { runs } from './live.ts'
import type { Item, ServerEvent } from './protocol.ts'

async function sessionFile(sessionId: string) {
  const projectsDir = path.join(readConfig().claudeBaseDir, 'projects')
  for (const dir of await readdir(projectsDir)) {
    const file = path.join(projectsDir, dir, `${sessionId}.jsonl`)
    try {
      return { file, stats: await stat(file) }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
  }
  return null
}

async function readSession(sessionId: string, file: string) {
  const text = await readFile(file, 'utf8')
  const entries = text.split('\n').flatMap((line): SessionStoreEntry[] => {
    const entry = parseLine(line)
    return entry !== null && typeof entry.type === 'string'
      ? [{ ...entry, type: entry.type }]
      : []
  })
  const pages: { before: number; disk: SessionMessage[] }[] = []
  const seen = new Set<string>()
  let before: number | null = entries.length
  while (before !== null) {
    const kept = entries.slice(0, before)
    const disk = await getSessionMessages(sessionId, {
      sessionStore: { append: () => Promise.resolve(), load: async () => kept },
    })
    pages.push({ before, disk: disk.filter((item) => !seen.has(item.uuid)) })
    for (const item of disk) seen.add(item.uuid)
    before = compactedBefore(entries, disk[0]?.uuid)
  }
  return { entries, pages }
}

let cached: {
  file: string
  mtimeMs: number
  size: number
  session: ReturnType<typeof readSession>
} | null = null

async function loadSession(sessionId: string) {
  const found = await sessionFile(sessionId)
  if (found === null) return null
  if (
    cached !== null &&
    cached.file === found.file &&
    cached.mtimeMs === found.stats.mtimeMs &&
    cached.size === found.stats.size
  )
    return cached.session
  const session = readSession(sessionId, found.file)
  cached = {
    file: found.file,
    mtimeMs: found.stats.mtimeMs,
    size: found.stats.size,
    session,
  }
  return session
}

function messageTimes(entries: SessionStoreEntry[]) {
  const times = new Map<string, number>()
  for (const entry of entries)
    if (typeof entry.uuid === 'string' && typeof entry.timestamp === 'string')
      times.set(entry.uuid, Date.parse(entry.timestamp))
  return times
}

function toolOutputs(entries: SessionStoreEntry[]) {
  const outputs = new Map<string, unknown>()
  for (const entry of entries)
    if (typeof entry.uuid === 'string' && entry.toolUseResult !== undefined)
      outputs.set(entry.uuid, entry.toolUseResult)
  return outputs
}

function compactedBefore(
  entries: SessionStoreEntry[],
  uuid: string | undefined
) {
  if (uuid === undefined) return null
  const start = entries.findIndex((entry) => entry.uuid === uuid)
  const index = entries.findLastIndex(
    (entry, position) =>
      position < start &&
      entry.type === 'system' &&
      entry.subtype === 'compact_boundary'
  )
  return index < 0 ? null : index
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

function mainMessages(disk: SessionMessage[], entries: SessionStoreEntry[]) {
  const times = messageTimes(entries)
  const outputs = toolOutputs(entries)
  return disk.flatMap((item): Message[] => {
    if (item.type === 'system' || item.parent_tool_use_id !== null) return []
    const message = toMessage(
      item.type,
      { ...item, tool_use_result: outputs.get(item.uuid) },
      times.get(item.uuid) ?? null
    )
    return [
      {
        ...message,
        content: message.content.map((block) =>
          block.type === 'image' ? { ...block, data: null } : block
        ),
      },
    ]
  })
}

export async function image(sessionId: string, uuid: string, index: number) {
  const session = await loadSession(sessionId)
  if (session === null) throw new Error(`session ${sessionId} not found`)
  const item = session.pages
    .flatMap((page) => page.disk)
    .find((candidate) => candidate.uuid === uuid)
  if (item === undefined) throw new Error(`message ${uuid} not found`)
  if (item.type === 'system' || item.parent_tool_use_id !== null)
    throw new Error(`message ${uuid} has no image ${index}`)
  const block = toMessage(item.type, item, null).content.filter(
    (candidate) => candidate.type === 'image'
  )[index]
  if (block === undefined || block.data === null)
    throw new Error(`message ${uuid} has no image ${index}`)
  return { mediaType: block.mediaType, data: block.data }
}

export async function history(
  sessionId: string,
  cwd: string
): Promise<ServerEvent> {
  const found = runs.get(sessionId)
  const run = found?.provider === 'claude' ? found : undefined
  const [disk, session] = await Promise.all([
    getSessionMessages(sessionId, { dir: cwd }),
    loadSession(sessionId),
  ])
  const entries = session === null ? [] : session.entries
  const resumeAt = run?.resumeAt ?? null
  const kept =
    resumeAt === null
      ? disk
      : disk.slice(0, disk.findIndex((item) => item.uuid === resumeAt) + 1)
  const messages = mainMessages(kept, entries)
  const seen = new Set(messages.map((item) => item.uuid))
  const last = kept.findLast(
    (item) => item.type === 'assistant' && item.parent_tool_use_id === null
  )
  const tokens = last === undefined ? null : contextTokens(last.message)
  return {
    type: 'history',
    sessionId,
    provider: 'claude',
    items: toItems([
      ...messages,
      ...(run?.messages.filter((item) => !seen.has(item.uuid)) ?? []),
    ]),
    requests: [...(run?.pending.values() ?? [])].map((item) => item.request),
    queue: run?.queue ?? [],
    settings: run?.settings ?? null,
    context:
      run?.context ?? (tokens === null ? null : { tokens, window: null }),
    before: compactedBefore(entries, disk[0]?.uuid),
    partial: run?.partial ?? '',
  }
}

export async function earlier(sessionId: string, before: number) {
  const session = await loadSession(sessionId)
  if (session === null) throw new Error(`session ${sessionId} not found`)
  const index = session.pages.findIndex((page) => page.before === before)
  if (index < 0) throw new Error(`no messages before entry ${before}`)
  const items = toItems([
    ...mainMessages(session.pages[index].disk, session.entries),
    { type: 'compaction', uuid: `compacted:${before}`, time: null },
  ])
  return { items, before: session.pages[index + 1]?.before ?? null }
}

export async function agentMessages(
  sessionId: string,
  cwd: string,
  agentId: string,
  parent: string
): Promise<Item[]> {
  if (!/^\w+$/.test(agentId)) throw new Error(`invalid agent id ${agentId}`)
  const disk = await getSubagentMessages(sessionId, agentId, { dir: cwd })
  return toItems(
    disk.flatMap((item): Message[] =>
      item.type === 'system'
        ? []
        : [toMessage(item.type, { ...item, parent_tool_use_id: parent }, null)]
    )
  )
}
