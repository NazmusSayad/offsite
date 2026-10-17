import type { Item } from '@offsite/core/items'
import {
  editStats,
  relative,
  type WorkItem,
} from '@/features/transcript/tool-details'

export type UserItem = Extract<Item, { kind: 'user' }>

export type AgentItem = Extract<
  Item,
  { kind: 'subagent' | 'agent_message' | 'command' }
>

export type QuestionItem = Extract<Item, { kind: 'question' }>

export type Turn = { prompt: UserItem | null; first: boolean; items: Item[] }

export type Stat = { added: number; removed: number }

export type Row =
  | { kind: 'user'; key: string; item: UserItem; first: boolean }
  | { kind: 'working'; key: string }
  | { kind: 'group'; key: string; entries: WorkItem[]; live: boolean }
  | { kind: 'agent'; key: string; item: AgentItem; live: boolean }
  | {
      kind: 'assistant'
      key: string
      message: string
      text: string
      time: number | null
      streaming: boolean
      meta: boolean
      changed: Map<string, Stat>
    }
  | { kind: 'error'; key: string; text: string; time: number | null }
  | { kind: 'notice'; key: string; text: string }
  | { kind: 'plan'; key: string; plan: string }
  | { kind: 'question'; key: string; item: QuestionItem }

export function isTool(row: Row) {
  return row.kind === 'group' || row.kind === 'agent'
}

export function turnRows(
  turn: Turn,
  cwd: string,
  live: { partial: string } | null
): Row[] {
  const rows: Row[] = []
  const turnKey = turn.prompt?.id ?? 'start'

  if (turn.prompt !== null) {
    rows.push({
      kind: 'user',
      key: turn.prompt.id,
      item: turn.prompt,
      first: turn.first,
    })
  }

  for (const item of turn.items) {
    const row = rowOf(item, live !== null)
    const previous = rows.at(-1)
    if (row?.kind === 'group' && previous?.kind === 'group') {
      previous.entries.push(...row.entries)
    } else if (row !== null) {
      rows.push(row)
    }
  }

  const last = rows.at(-1)
  if (live !== null && live.partial === '' && last?.kind === 'group') {
    rows[rows.length - 1] = { ...last, live: true }
  }
  if (live !== null && live.partial !== '') {
    rows.push({
      kind: 'assistant',
      key: `${turnKey}:partial`,
      message: '',
      text: live.partial,
      time: null,
      streaming: true,
      meta: false,
      changed: new Map(),
    })
  }
  if (live !== null && live.partial === '') {
    rows.push({ kind: 'working', key: `${turnKey}:working` })
  }

  if (live === null && last?.kind === 'assistant') {
    rows[rows.length - 1] = {
      ...last,
      meta: true,
      changed: changes(turn.items, cwd),
    }
  }
  return rows
}

function changes(items: Item[], cwd: string) {
  const changed = new Map<string, Stat>()
  for (const item of items) {
    if (item.kind !== 'file_change' || item.diffs.length === 0) {
      continue
    }
    const stats = editStats(item)
    const file = relative(item.path, cwd)
    const current = changed.get(file) ?? { added: 0, removed: 0 }
    changed.set(file, {
      added: current.added + stats.added,
      removed: current.removed + stats.removed,
    })
  }
  return changed
}

function rowOf(item: Item, live: boolean): Row | null {
  switch (item.kind) {
    case 'assistant':
      return {
        kind: 'assistant',
        key: item.id,
        message: item.message,
        text: item.text,
        time: item.time,
        streaming: false,
        meta: false,
        changed: new Map(),
      }
    case 'reasoning':
    case 'file_change':
    case 'web_search':
    case 'skill':
    case 'tool':
      return {
        kind: 'group',
        key: `group:${item.id}`,
        entries: [item],
        live: false,
      }
    case 'command':
      return item.background === null
        ? {
            kind: 'group',
            key: `group:${item.id}`,
            entries: [item],
            live: false,
          }
        : { kind: 'agent', key: item.id, item, live }
    case 'subagent':
    case 'agent_message':
      return { kind: 'agent', key: item.id, item, live }
    case 'plan':
      return { kind: 'plan', key: item.id, plan: item.plan }
    case 'question':
      return { kind: 'question', key: item.id, item }
    case 'notice':
      return { kind: 'notice', key: item.id, text: item.text }
    case 'compaction':
      return { kind: 'notice', key: item.id, text: 'Conversation compacted' }
    case 'error':
      return { kind: 'error', key: item.id, text: item.text, time: item.time }
    case 'user':
    case 'todo_list':
      return null
  }
}

export function mainRows(
  items: Item[],
  cwd: string,
  running: boolean,
  partial: string
) {
  const turns: Turn[] = []
  let answered = false
  for (const item of items) {
    if (item.parent !== null) {
      continue
    }
    if (item.kind === 'user') {
      turns.push({ prompt: item, first: !answered, items: [] })
      continue
    }
    if (
      item.kind !== 'notice' &&
      item.kind !== 'error' &&
      item.kind !== 'compaction'
    ) {
      answered = true
    }
    if (turns.length === 0) {
      turns.push({ prompt: null, first: true, items: [] })
    }
    turns[turns.length - 1].items.push(item)
  }
  const rows = turns.flatMap((turn, index) =>
    turnRows(
      turn,
      cwd,
      running && index === turns.length - 1 ? { partial } : null
    )
  )
  if (running && turns.length === 0) {
    rows.push({ kind: 'working', key: 'working' })
  }
  return rows
}
