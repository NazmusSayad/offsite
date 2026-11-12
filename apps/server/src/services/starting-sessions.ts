import { runs } from '../lib/live.ts'
import type { Found } from './provider-sessions.ts'

const starting = new Map<string, Found>()

export function addStarting(item: Found) {
  starting.set(item.id, item)
}

export function forgetStarting(id: string) {
  starting.delete(id)
}

export function startingSessions(found: Found[]) {
  return [...starting.values()].filter(
    (item) => runs.has(item.id) && !found.some((other) => other.id === item.id)
  )
}
