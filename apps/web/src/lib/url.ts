import { home } from '@/api/machines'
import { getState, type Selection } from './store'

export function selectionFromUrl(machines: string[]): Selection | null {
  const params = new URLSearchParams(location.search)
  const cwd = params.get('cwd')
  const machine = params.get('machine') ?? home
  if (cwd === null || !machines.includes(machine)) return null
  return { machine, cwd, sessionId: params.get('session') }
}

export function syncUrl() {
  const selection = getState().selection
  const params = new URLSearchParams()
  if (selection !== null) {
    if (selection.machine !== home) params.set('machine', selection.machine)
    params.set('cwd', selection.cwd)
    if (selection.sessionId !== null) params.set('session', selection.sessionId)
  }
  const search = params.toString()
  history.replaceState(null, '', search === '' ? '/' : `/?${search}`)
}
