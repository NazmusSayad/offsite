import type { Item, TodoStep } from '@offsite/core/items'

type Progress = {
  step: Item | null
  todos: TodoStep[] | null
  work: Map<string, Item>
}

const keptWork = 30
const progress = new Map<string, Progress>()

export function noteItems(sessionId: string, items: Item[]) {
  const known = progress.get(sessionId) ?? {
    step: null,
    todos: null,
    work: new Map(),
  }
  for (const item of items) {
    if (item.kind === 'todo_list') {
      known.todos = item.steps
    }
    if (
      item.parent === null &&
      item.kind !== 'user' &&
      item.kind !== 'todo_list'
    ) {
      known.step = brief(item)
    }
    if (
      (item.kind === 'command' && item.background !== null) ||
      item.kind === 'subagent'
    ) {
      known.work.delete(item.id)
      known.work.set(item.id, brief(item))
    }
  }
  for (const id of [...known.work.keys()].slice(0, -keptWork)) {
    known.work.delete(id)
  }
  progress.set(sessionId, known)
}

export function progressOf(sessionId: string) {
  const known = progress.get(sessionId)
  return {
    step: known?.step ?? null,
    todos: known?.todos ?? null,
    work: [...(known?.work.values() ?? [])],
  }
}

export function forgetProgress(sessionId: string) {
  progress.delete(sessionId)
}

function brief(item: Item): Item {
  switch (item.kind) {
    case 'command':
      return {
        ...item,
        output: '',
        background:
          item.background === null ? null : { ...item.background, events: [] },
      }
    case 'file_change':
      return { ...item, diffs: [], output: '' }
    case 'web_search':
      return { ...item, results: [], output: '' }
    case 'skill':
      return { ...item, output: '' }
    case 'tool':
      return {
        ...item,
        input: Object.fromEntries(
          Object.entries(item.input).filter(
            (entry) => typeof entry[1] === 'string' && entry[1].length <= 200
          )
        ),
        output: '',
      }
    case 'assistant':
      return { ...item, text: item.text.slice(-400), message: '' }
    case 'reasoning':
    case 'notice':
    case 'error':
    case 'received_message':
      return { ...item, text: item.text.slice(-400) }
    case 'plan':
      return { ...item, plan: item.plan.slice(0, 400) }
    case 'compaction':
      return { ...item, summary: null }
    case 'user':
      return { ...item, text: item.text.slice(0, 400), images: [] }
    case 'todo_list':
    case 'question':
    case 'subagent':
    case 'agent_message':
      return item
  }
}
