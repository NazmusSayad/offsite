import type { StateHistory, StateHistoryEntry } from './types.ts'

export function record<Meta>(
  history: StateHistory<Meta>,
  entry: StateHistoryEntry<Meta>,
  limit: number
): StateHistory<Meta> {
  const past = limit === 0 ? [] : [...history.past, entry].slice(-limit)
  return { past, future: [] }
}

export function undone<Meta>(
  history: StateHistory<Meta>,
  entry: StateHistoryEntry<Meta>
): StateHistory<Meta> {
  return { past: history.past.slice(0, -1), future: [entry, ...history.future] }
}

export function redone<Meta>(
  history: StateHistory<Meta>,
  entry: StateHistoryEntry<Meta>
): StateHistory<Meta> {
  return { past: [...history.past, entry], future: history.future.slice(1) }
}
