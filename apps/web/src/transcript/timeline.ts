import type { Block, Message } from '@server/protocol'
import {
  editedFile,
  editStats,
  relative,
  type ToolUse,
  type WorkEntry,
} from '@/transcript/tool-details'

export type Turn = { prompt: Message | null; first: boolean; items: Message[] }

export type Stat = { added: number; removed: number }

type Segment =
  | { kind: 'entry'; entry: WorkEntry }
  | { kind: 'agent'; key: string; tool: ToolUse }
  | {
      kind: 'text'
      key: string
      uuid: string
      text: string
      time: number | null
    }
  | {
      kind: 'notice'
      key: string
      text: string
      isError: boolean
      time: number | null
    }
  | { kind: 'plan'; key: string; plan: string }
  | { kind: 'question'; key: string; tool: ToolUse }

export type Row =
  | {
      kind: 'user'
      key: string
      message: Extract<Message, { type: 'user' | 'assistant' }>
      first: boolean
    }
  | { kind: 'working'; key: string }
  | { kind: 'group'; key: string; entries: WorkEntry[]; live: boolean }
  | { kind: 'agent'; key: string; tool: ToolUse; live: boolean }
  | {
      kind: 'assistant'
      key: string
      uuid: string
      text: string
      time: number | null
      streaming: boolean
      meta: boolean
      changed: Map<string, Stat>
    }
  | { kind: 'error'; key: string; text: string; time: number | null }
  | { kind: 'notice'; key: string; text: string }
  | { kind: 'plan'; key: string; plan: string }
  | { kind: 'question'; key: string; tool: ToolUse }

export function isTool(row: Row) {
  return row.kind === 'group' || row.kind === 'agent'
}

export function turnRows(
  turn: Turn,
  cwd: string,
  live: { partial: string } | null
): Row[] {
  const rows: Row[] = []
  const turnKey = turn.prompt?.uuid ?? 'start'
  const segments = turn.items.flatMap(segmentsOf)

  if (turn.prompt !== null && turn.prompt.type !== 'notice') {
    const prompt = turn.prompt
    const notifications = prompt.content.flatMap((block) =>
      block.type === 'text' && block.text.startsWith('<task-notification>')
        ? [block.text]
        : []
    )
    const summaries = notifications.flatMap((notification) =>
      [
        ...notification.matchAll(
          /<task-notification>([\s\S]*?)<\/task-notification>/g
        ),
      ].map(
        (match) =>
          /<summary>([\s\S]*?)<\/summary>/.exec(match[1])?.[1] ??
          'Background task updated'
      )
    )
    for (const [index, summary] of summaries.entries())
      rows.push({
        kind: 'notice',
        key: `${prompt.uuid}:${index}`,
        text: summary,
      })
    if (notifications.length === 0)
      rows.push(
        prompt.content.some(
          (block) =>
            block.type === 'text' &&
            block.text.startsWith('[Request interrupted by user')
        )
          ? { kind: 'notice', key: prompt.uuid, text: 'Interrupted' }
          : {
              kind: 'user',
              key: prompt.uuid,
              message: prompt,
              first: turn.first,
            }
      )
  }

  for (const segment of segments) {
    const previous = rows.at(-1)
    if (segment.kind !== 'entry') rows.push(segmentRow(segment, live !== null))
    else if (previous?.kind === 'group') previous.entries.push(segment.entry)
    else
      rows.push({
        kind: 'group',
        key: `group:${segment.entry.key}`,
        entries: [segment.entry],
        live: false,
      })
  }

  const last = rows.at(-1)
  if (live !== null && live.partial === '' && last?.kind === 'group')
    rows[rows.length - 1] = { ...last, live: true }
  if (live !== null && live.partial !== '')
    rows.push({
      kind: 'assistant',
      key: `${turnKey}:partial`,
      uuid: '',
      text: live.partial,
      time: null,
      streaming: true,
      meta: false,
      changed: new Map(),
    })
  if (live !== null && live.partial === '')
    rows.push({ kind: 'working', key: `${turnKey}:working` })

  if (live === null && last?.kind === 'assistant')
    rows[rows.length - 1] = {
      ...last,
      meta: true,
      changed: changes(segments, cwd),
    }
  return rows
}

function changes(segments: Segment[], cwd: string) {
  const changed = new Map<string, Stat>()
  for (const segment of segments) {
    if (segment.kind !== 'entry' || segment.entry.kind !== 'tool') continue
    const stats = editStats(segment.entry.tool)
    if (stats === null) continue
    const file = relative(editedFile(segment.entry.tool), cwd)
    const current = changed.get(file) ?? { added: 0, removed: 0 }
    changed.set(file, {
      added: current.added + stats.added,
      removed: current.removed + stats.removed,
    })
  }
  return changed
}

function segmentRow(
  segment: Exclude<Segment, { kind: 'entry' }>,
  live: boolean
): Row {
  switch (segment.kind) {
    case 'agent':
      return { kind: 'agent', key: segment.key, tool: segment.tool, live }
    case 'text':
      return {
        kind: 'assistant',
        key: segment.key,
        uuid: segment.uuid,
        text: segment.text,
        time: segment.time,
        streaming: false,
        meta: false,
        changed: new Map(),
      }
    case 'notice':
      return segment.isError
        ? {
            kind: 'error',
            key: segment.key,
            text: segment.text,
            time: segment.time,
          }
        : { kind: 'notice', key: segment.key, text: segment.text }
    case 'plan':
      return { kind: 'plan', key: segment.key, plan: segment.plan }
    case 'question':
      return { kind: 'question', key: segment.key, tool: segment.tool }
  }
}

function segmentsOf(message: Message): Segment[] {
  if (message.type === 'notice')
    return [
      {
        kind: 'notice',
        key: message.uuid,
        text: message.text,
        isError: message.isError,
        time: message.time,
      },
    ]
  if (message.type === 'user') return []
  return message.content.flatMap((block, index): Segment[] => {
    const key = `${message.uuid}:${index}`
    switch (block.type) {
      case 'text':
        return block.text.trim() === ''
          ? []
          : [
              {
                kind: 'text',
                key,
                uuid: message.uuid,
                text: block.text,
                time: message.time,
              },
            ]
      case 'thinking':
        return block.thinking.trim() === ''
          ? []
          : [
              {
                kind: 'entry',
                entry: { kind: 'thinking', key, text: block.thinking },
              },
            ]
      case 'tool_use':
        switch (block.name) {
          case 'TodoWrite':
            return []
          case 'Agent':
          case 'Task':
          case 'SendMessage':
          case 'Monitor':
            return [{ kind: 'agent', key, tool: block }]
          case 'Bash':
            return block.input.run_in_background === true
              ? [{ kind: 'agent', key, tool: block }]
              : [{ kind: 'entry', entry: { kind: 'tool', key, tool: block } }]
          case 'AskUserQuestion':
            return [{ kind: 'question', key, tool: block }]
          case 'ExitPlanMode':
            return [
              {
                kind: 'plan',
                key,
                plan:
                  typeof block.input.plan === 'string' ? block.input.plan : '',
              },
            ]
          default:
            return [
              {
                kind: 'entry',
                entry: { kind: 'tool', key, tool: block },
              },
            ]
        }
      case 'image':
      case 'tool_result':
        return []
    }
  })
}

export function isPrompt(blocks: Block[]) {
  return blocks.some((block) => block.type === 'text' || block.type === 'image')
}

export function mainRows(
  messages: Message[],
  cwd: string,
  running: boolean,
  partial: string
) {
  const turns: Turn[] = []
  let answered = false
  for (const message of messages) {
    if (message.type !== 'notice' && message.parent !== null) continue
    if (message.type === 'user' && isPrompt(message.content)) {
      turns.push({ prompt: message, first: !answered, items: [] })
      continue
    }
    if (message.type === 'assistant') answered = true
    if (turns.length === 0) turns.push({ prompt: null, first: true, items: [] })
    turns[turns.length - 1].items.push(message)
  }
  const rows = turns.flatMap((turn, index) =>
    turnRows(
      turn,
      cwd,
      running && index === turns.length - 1 ? { partial } : null
    )
  )
  if (running && turns.length === 0)
    rows.push({ kind: 'working', key: 'working' })
  return rows
}
