import { getState, type Selection } from './store'

export function selectionFromUrl(machines: string[]): Selection | null {
  const params = new URLSearchParams(location.search)
  const machine = params.get('machine')
  const projectId = params.get('project')
  if (machine === null || projectId === null || !machines.includes(machine))
    return null
  return { machine, projectId, sessionId: params.get('session') }
}

export function syncUrl() {
  const selection = getState().selection
  const params = new URLSearchParams()
  if (selection !== null) {
    params.set('machine', selection.machine)
    params.set('project', selection.projectId)
    if (selection.sessionId !== null) params.set('session', selection.sessionId)
  }
  const search = params.toString()
  history.replaceState(null, '', search === '' ? '/' : `/?${search}`)
}
