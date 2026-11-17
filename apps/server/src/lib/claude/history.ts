import {
  getSessionMessages,
  getSubagentMessages,
  type SessionMessage,
  type SessionStoreEntry,
} from '@anthropic-ai/claude-agent-sdk'
import type { Item } from '@offsite/core/items'
import type { RpcMethods, ServerEvent } from '@offsite/core/protocol'
import { runs } from '../live.ts'
import { contextTokens, type Message, toMessage } from './content.ts'
import { toItems } from './items.ts'
import { compactedBefore, loadSession, type Session } from './session-file.ts'

function messageTimes(entries: SessionStoreEntry[]) {
  const times = new Map<string, number>()
  for (const entry of entries) {
    if (typeof entry.uuid === 'string' && typeof entry.timestamp === 'string') {
      times.set(entry.uuid, Date.parse(entry.timestamp))
    }
  }
  return times
}

function toolOutputs(entries: SessionStoreEntry[]) {
  const outputs = new Map<string, unknown>()
  for (const entry of entries) {
    if (typeof entry.uuid === 'string' && entry.toolUseResult !== undefined) {
      outputs.set(entry.uuid, entry.toolUseResult)
    }
  }
  return outputs
}

function mainMessages(disk: SessionMessage[], entries: SessionStoreEntry[]) {
  const times = messageTimes(entries)
  const outputs = toolOutputs(entries)
  const summaries = new Set(
    entries.flatMap((entry) =>
      entry.isCompactSummary === true && typeof entry.uuid === 'string'
        ? [entry.uuid]
        : []
    )
  )
  return disk.flatMap((item): Message[] => {
    if (item.type === 'system' || item.parent_tool_use_id !== null) {
      return []
    }
    const message = toMessage(
      item.type,
      { ...item, tool_use_result: outputs.get(item.uuid) },
      times.get(item.uuid) ?? null
    )
    if (summaries.has(item.uuid)) {
      return [
        {
          type: 'compaction',
          uuid: item.uuid,
          time: message.time,
          summary: message.content
            .flatMap((block) => (block.type === 'text' ? [block.text] : []))
            .join('\n')
            .replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, ''),
        },
      ]
    }
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
  if (session === null) {
    throw new Error(`session ${sessionId} not found`)
  }
  const item =
    findMessage(session, uuid) ??
    (session.start === 0
      ? undefined
      : findMessage(await loadSession(sessionId, true), uuid))
  if (item === undefined) {
    throw new Error(`message ${uuid} not found`)
  }
  if (item.type === 'system' || item.parent_tool_use_id !== null) {
    throw new Error(`message ${uuid} has no image ${index}`)
  }
  const block = toMessage(item.type, item, null).content.filter(
    (candidate) => candidate.type === 'image'
  )[index]
  if (block === undefined || block.data === null) {
    throw new Error(`message ${uuid} has no image ${index}`)
  }
  return { mediaType: block.mediaType, data: block.data }
}

function findMessage(session: Session | null, uuid: string) {
  if (session === null) {
    throw new Error('session not found')
  }
  return session.pages
    .flatMap((page) => page.disk)
    .find((candidate) => candidate.uuid === uuid)
}

export async function shownMessages(sessionId: string) {
  const session = await loadSession(sessionId)
  const disk =
    session === null
      ? await getSessionMessages(sessionId)
      : session.pages[0].disk
  const found = runs.get(sessionId)
  const saved = session?.entries.findLast(
    (entry) => entry.type === 'last-prompt' && entry.rewound === true
  )
  const cuts = [found?.provider === 'claude' ? found.cut : null, saved?.cutUuid]
  const index = disk.findIndex((item) => cuts.includes(item.uuid))
  return index < 0 ? disk : disk.slice(0, index)
}

export async function history(sessionId: string): Promise<ServerEvent> {
  const found = runs.get(sessionId)
  const run = found?.provider === 'claude' ? found : undefined
  const [disk, session] = await Promise.all([
    shownMessages(sessionId),
    loadSession(sessionId),
  ])
  const entries = session === null ? [] : session.entries
  const resumeAt = run?.resumeAt ?? null
  const resumeIndex = disk.findIndex((item) => item.uuid === resumeAt)
  const kept = resumeIndex < 0 ? disk : disk.slice(0, resumeIndex + 1)
  const messages = mainMessages(kept, entries)
  const seen = new Set(messages.map((item) => item.uuid))
  const last = kept.findLast(
    (item) => item.type === 'assistant' && item.parent_tool_use_id === null
  )
  const tokens = last === undefined ? null : contextTokens(last.message)
  const live = run?.messages ?? []
  const compacted = live.findLastIndex((item) => item.type === 'compaction')
  return {
    type: 'history',
    sessionId,
    provider: 'claude',
    items: toItems([
      ...messages,
      ...live.slice(compacted + 1).filter((item) => !seen.has(item.uuid)),
    ]),
    requests: [...(run?.pending.values() ?? [])].map((item) => item.request),
    settings: run?.settings ?? null,
    context:
      run?.context ?? (tokens === null ? null : { tokens, window: null }),
    before: boundaryOffset(session, compactedBefore(entries, disk[0]?.uuid)),
    partial: run?.partial ?? '',
  }
}

export async function earlier(sessionId: string, before: number) {
  const session = await loadSession(sessionId, true)
  if (session === null) {
    throw new Error(`session ${sessionId} not found`)
  }
  const entry = session.offsets.indexOf(before)
  const index = session.pages.findIndex((page) => page.before === entry)
  if (entry < 0 || index < 0) {
    throw new Error(`no messages before byte ${before}`)
  }
  const items = toItems(
    mainMessages(session.pages[index].disk, session.entries)
  )
  return {
    items,
    before: boundaryOffset(session, session.pages[index + 1]?.before ?? null),
  }
}

function boundaryOffset(session: Session | null, entry: number | null) {
  if (session === null || entry === null) {
    return null
  }
  const offset = session.offsets[entry]
  if (offset === undefined) {
    throw new Error(`entry ${entry} has no position in the session file`)
  }
  return offset
}

export async function agentMessages(
  request: RpcMethods['sessions.agent']['params']
): Promise<Item[]> {
  if (!/^\w+$/.test(request.agentId)) {
    throw new Error(`invalid agent id ${request.agentId}`)
  }
  const disk = await getSubagentMessages(request.sessionId, request.agentId)
  return toItems(
    disk.flatMap((item): Message[] =>
      item.type === 'system'
        ? []
        : [
            toMessage(
              item.type,
              { ...item, parent_tool_use_id: request.parent },
              null
            ),
          ]
    )
  )
}
