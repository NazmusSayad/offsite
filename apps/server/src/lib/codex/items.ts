import type { Item, ItemImage, ItemStatus } from '@offsite/core/protocol'
import { isRecord } from '../claude/content.ts'
import type { Status, ThreadItem, Turn, UserInput } from './types.ts'

const statuses: Record<Status | 'interrupted', ItemStatus> = {
  inProgress: 'running',
  completed: 'completed',
  failed: 'failed',
  declined: 'stopped',
  interrupted: 'stopped',
}

export function turnItems(turns: Turn[], parent: string | null) {
  return turns.flatMap((turn) => [
    ...turn.items.flatMap((item) =>
      toItems(
        turn.id,
        item,
        parent,
        turn.startedAt === null ? null : turn.startedAt * 1000
      )
    ),
    ...(turn.status === 'failed' && turn.error !== null
      ? [errorItem(`${turn.id}:error`, turn.error.message)]
      : []),
  ])
}

export function itemId(turnId: string, id: string) {
  return `${turnId}:${id}`
}

export function turnOf(itemId: string) {
  const index = itemId.indexOf(':')
  if (index < 0) {
    throw new Error(`${itemId} is not a Codex item`)
  }
  return itemId.slice(0, index)
}

export function errorItem(id: string, text: string): Item {
  return { id, parent: null, time: Date.now(), kind: 'error', text }
}

export function toItems(
  turnId: string,
  item: ThreadItem,
  parent: string | null,
  time: number | null
): Item[] {
  const base = { id: itemId(turnId, item.id), parent, time }
  switch (item.type) {
    case 'userMessage':
      return [
        {
          ...base,
          kind: 'user',
          text: item.content.flatMap(userText).join('\n').trim(),
          images: item.content.flatMap(userImages),
          format: 'text',
        },
      ]
    case 'agentMessage':
      return item.text.trim() === ''
        ? []
        : [{ ...base, kind: 'assistant', text: item.text, message: base.id }]
    case 'reasoning': {
      const text = [...item.summary, ...item.content].join('\n\n').trim()
      return text === '' ? [] : [{ ...base, kind: 'reasoning', text }]
    }
    case 'plan':
      return [{ ...base, kind: 'plan', plan: item.text }]
    case 'commandExecution':
      return [
        {
          ...base,
          kind: 'command',
          command: item.command,
          description: '',
          output: item.aggregatedOutput ?? '',
          status: statuses[item.status],
          background: null,
        },
      ]
    case 'fileChange':
      return item.changes.map((change, index) => ({
        ...base,
        id: `${base.id}:${index}`,
        kind: 'file_change',
        path: change.path,
        diffs:
          change.kind.type === 'add'
            ? [{ before: '', after: change.diff }]
            : change.kind.type === 'delete'
              ? [{ before: change.diff, after: '' }]
              : hunks(change.diff),
        output: '',
        status: statuses[item.status],
      }))
    case 'mcpToolCall':
      return [
        {
          ...base,
          kind: 'tool',
          name: `${item.server}.${item.tool}`,
          input: record(item.arguments),
          output:
            item.error?.message ??
            (item.result === null ? '' : contentText(item.result.content)),
          status: statuses[item.status],
        },
      ]
    case 'dynamicToolCall':
      return [
        {
          ...base,
          kind: 'tool',
          name: item.tool,
          input: record(item.arguments),
          output: contentText(item.contentItems ?? []),
          status: statuses[item.status],
        },
      ]
    case 'collabAgentToolCall':
      if (item.tool === 'spawnAgent') {
        return [
          {
            ...base,
            kind: 'subagent',
            agent: item.model ?? 'Agent',
            description: item.prompt ?? '',
            agentId: item.receiverThreadIds[0] ?? null,
            status: statuses[item.status],
          },
        ]
      }
      return [
        {
          ...base,
          kind: 'agent_message',
          target: item.receiverThreadIds[0] ?? null,
          summary: item.prompt ?? item.tool,
          status: statuses[item.status],
        },
      ]
    case 'webSearch':
      return [
        {
          ...base,
          kind: 'web_search',
          query:
            item.action?.type === 'search'
              ? (item.action.query ?? item.query)
              : item.query === ''
                ? null
                : item.query,
          url:
            item.action?.type === 'openPage' ||
            item.action?.type === 'findInPage'
              ? item.action.url
              : null,
          results: [],
          output: '',
          status: 'completed',
        },
      ]
    case 'imageView':
      return [
        {
          ...base,
          kind: 'tool',
          name: 'view_image',
          input: { path: item.path },
          output: '',
          status: 'completed',
        },
      ]
    case 'contextCompaction':
      return [{ ...base, kind: 'compaction' }]
    case 'hookPrompt':
    case 'functionCallOutput':
    case 'subAgentActivity':
    case 'sleep':
    case 'imageGeneration':
    case 'enteredReviewMode':
    case 'exitedReviewMode':
      return []
  }
}

function userText(input: UserInput) {
  switch (input.type) {
    case 'text':
      return [input.text]
    case 'skill':
    case 'mention':
      return [`$${input.name}`]
    case 'image':
    case 'localImage':
      return []
  }
}

function userImages(input: UserInput): ItemImage[] {
  if (input.type !== 'image') {
    return []
  }
  const match = /^data:([^;,]+);base64,(.*)$/.exec(input.url)
  if (match === null) {
    return []
  }
  return [{ mediaType: match[1], data: match[2] }]
}

export function hunks(diff: string) {
  const result: { before: string; after: string }[] = []
  let before: string[] = []
  let after: string[] = []
  let inside = false
  function flush() {
    if (inside) {
      result.push({ before: before.join('\n'), after: after.join('\n') })
    }
    before = []
    after = []
  }
  for (const line of diff.split('\n')) {
    if (line.startsWith('@@')) {
      flush()
      inside = true
      continue
    }
    if (!inside || line === '' || line.startsWith('\\')) {
      continue
    }
    if (line.startsWith('-')) {
      before.push(line.slice(1))
    } else if (line.startsWith('+')) {
      after.push(line.slice(1))
    } else {
      before.push(line.slice(1))
      after.push(line.slice(1))
    }
  }
  flush()
  return result
}

function contentText(content: unknown[]) {
  return content
    .map((block) =>
      isRecord(block) && typeof block.text === 'string'
        ? block.text
        : JSON.stringify(block)
    )
    .join('\n')
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { value }
}
