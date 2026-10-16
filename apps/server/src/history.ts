import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import {
  getSessionMessages,
  getSubagentMessages,
  type SessionMessage,
  type SessionStoreEntry,
} from '@anthropic-ai/claude-agent-sdk'
import { readConfig } from './config.ts'
import { contextTokens, toMessage } from './content.ts'
import type { Message, ServerEvent } from './protocol.ts'
import { runs } from './run.ts'

async function sessionEntries(sessionId: string): Promise<SessionStoreEntry[]> {
  const projectsDir = path.join(readConfig().claudeBaseDir, 'projects')
  for (const dir of await readdir(projectsDir)) {
    let text: string
    try {
      text = await readFile(
        path.join(projectsDir, dir, `${sessionId}.jsonl`),
        'utf8'
      )
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    return text.split('\n').flatMap((line) => {
      const entry = parseLine(line)
      return entry !== null && typeof entry.type === 'string'
        ? [{ ...entry, type: entry.type }]
        : []
    })
  }
  return []
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
  return disk.flatMap((item) =>
    item.type === 'system' || item.parent_tool_use_id !== null
      ? []
      : [
          toMessage(
            item.type,
            { ...item, tool_use_result: outputs.get(item.uuid) },
            times.get(item.uuid) ?? null
          ),
        ]
  )
}

export async function history(
  sessionId: string,
  cwd: string
): Promise<ServerEvent> {
  const run = runs.get(sessionId)
  const [disk, entries] = await Promise.all([
    getSessionMessages(sessionId, { dir: cwd }),
    sessionEntries(sessionId),
  ])
  const resumeAt = run?.resumeAt ?? null
  const kept =
    resumeAt === null
      ? disk
      : disk.slice(0, disk.findIndex((item) => item.uuid === resumeAt) + 1)
  const messages = mainMessages(kept, entries)
  messages.push(...(await subagentMessages(sessionId, cwd, messages)))
  const seen = new Set(messages.map((item) => item.uuid))
  const last = kept.findLast(
    (item) => item.type === 'assistant' && item.parent_tool_use_id === null
  )
  const tokens = last === undefined ? null : contextTokens(last.message)
  return {
    type: 'history',
    sessionId,
    messages: [
      ...messages,
      ...(run?.messages.filter((item) => !seen.has(item.uuid)) ?? []),
    ],
    requests: [...(run?.pending.values() ?? [])].map((item) => item.request),
    queue: run?.queue ?? [],
    settings: run?.settings ?? null,
    context:
      run?.context ??
      (tokens === null
        ? null
        : { tokens, window: null, model: null, categories: [], sections: [] }),
    before: compactedBefore(entries, disk[0]?.uuid),
  }
}

export async function earlier(sessionId: string, cwd: string, before: number) {
  const entries = await sessionEntries(sessionId)
  const kept = entries.slice(0, before)
  const disk = await getSessionMessages(sessionId, {
    sessionStore: { append: () => Promise.resolve(), load: async () => kept },
  })
  const messages = mainMessages(disk, entries)
  messages.push(...(await subagentMessages(sessionId, cwd, messages)))
  messages.push({
    type: 'notice',
    uuid: `compacted:${before}`,
    time: null,
    text: 'Conversation compacted',
    isError: false,
  })
  return { messages, before: compactedBefore(entries, disk[0]?.uuid) }
}

async function subagentMessages(
  sessionId: string,
  cwd: string,
  messages: Message[]
): Promise<Message[]> {
  const agents = new Set(
    messages.flatMap((message) =>
      message.type === 'assistant'
        ? message.content.flatMap((block) =>
            block.type === 'tool_use' &&
            (block.name === 'Agent' || block.name === 'Task')
              ? [block.id]
              : []
          )
        : []
    )
  )
  const launches = messages.flatMap((message) =>
    message.type === 'user'
      ? message.content.flatMap((block) => {
          if (block.type !== 'tool_result' || !agents.has(block.toolUseId))
            return []
          const agentId = /agentId: (\w+)/.exec(
            block.content
              .map((item) => (item.type === 'text' ? item.text : ''))
              .join('\n')
          )?.[1]
          return agentId === undefined
            ? []
            : [{ agentId, parent: block.toolUseId }]
        })
      : []
  )
  const loaded = await Promise.all(
    launches.map(async (launch) => {
      const disk = await getSubagentMessages(sessionId, launch.agentId, {
        dir: cwd,
      })
      const items = disk.flatMap((item) =>
        item.type === 'system'
          ? []
          : [
              toMessage(
                item.type,
                { ...item, parent_tool_use_id: launch.parent },
                null
              ),
            ]
      )
      return [...items, ...(await subagentMessages(sessionId, cwd, items))]
    })
  )
  return loaded.flat()
}
