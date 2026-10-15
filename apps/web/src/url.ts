import { getState, type Selection } from './store'

export function selectionFromUrl(): Selection | null {
  const params = new URLSearchParams(location.search)
  const cwd = params.get('cwd')
  if (cwd === null) return null
  return { cwd, sessionId: params.get('session') }
}

export function syncUrl() {
  const selection = getState().selection
  const params = new URLSearchParams()
  if (selection !== null) {
    params.set('cwd', selection.cwd)
    if (selection.sessionId !== null) params.set('session', selection.sessionId)
  }
  const search = params.toString()
  history.replaceState(null, '', search === '' ? '/' : `/?${search}`)
}
