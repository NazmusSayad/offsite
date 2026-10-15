import { readdir, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  getSessionMessages,
  getSubagentMessages,
} from '@anthropic-ai/claude-agent-sdk'
import { contextTokens, toMessage } from './content.ts'
import type { Message, ServerEvent } from './protocol.ts'
import { runs } from './run.ts'

const projectsDir = path.join(
  process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'),
  'projects'
)

async function messageTimes(sessionId: string) {
  const times = new Map<string, number>()
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
    for (const line of text.split('\n')) {
      const entry = parseLine(line)
      if (
        entry !== null &&
        typeof entry.uuid === 'string' &&
        typeof entry.timestamp === 'string'
      )
        times.set(entry.uuid, Date.parse(entry.timestamp))
    }
    return times
  }
  return times
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function history(
  sessionId: string,
  cwd: string
): Promise<ServerEvent> {
  const run = runs.get(sessionId)
  const [disk, times] = await Promise.all([
    getSessionMessages(sessionId, { dir: cwd }),
    messageTimes(sessionId),
  ])
  const resumeAt = run?.resumeAt ?? null
  const kept =
    resumeAt === null
      ? disk
      : disk.slice(0, disk.findIndex((item) => item.uuid === resumeAt) + 1)
  const messages = kept.flatMap((item) =>
    item.type === 'system' || item.parent_tool_use_id !== null
      ? []
      : [toMessage(item.type, item, times.get(item.uuid) ?? null)]
  )
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
  }
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
