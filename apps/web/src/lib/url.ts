import type { Panel } from '@/features/workspace/panels'
import { getState, type Selection } from './store'

export function selectionFromUrl(machines: string[]): Selection | null {
  const params = new URLSearchParams(location.search)
  const machine = params.get('machine')
  const projectId = params.get('project')
  if (machine === null || projectId === null || !machines.includes(machine)) {
    return null
  }
  return { machine, projectId, sessionId: params.get('session') }
}

export function panelFromUrl(): Panel | null {
  const panel = new URLSearchParams(location.search).get('panel')
  if (panel === 'diff' || panel === 'tasks' || panel === 'files') {
    return panel
  }
  return null
}

export function terminalFromUrl() {
  return new URLSearchParams(location.search).get('bottom') === 'terminal'
}

export function syncPanels(panel: Panel | null, terminal: boolean) {
  const params = new URLSearchParams(location.search)
  if (panel === null) {
    params.delete('panel')
  }
  if (panel !== null) {
    params.set('panel', panel)
  }
  if (terminal) {
    params.set('bottom', 'terminal')
  }
  if (!terminal) {
    params.delete('bottom')
  }
  const search = params.toString()
  history.replaceState(history.state, '', search === '' ? '/' : `/?${search}`)
}

export function syncUrl() {
  const selection = getState().selection
  const panel = panelFromUrl()
  const terminal = terminalFromUrl()
  const params = new URLSearchParams()
  if (selection !== null) {
    params.set('machine', selection.machine)
    params.set('project', selection.projectId)
    if (selection.sessionId !== null) {
      params.set('session', selection.sessionId)
    }
    if (panel !== null) {
      params.set('panel', panel)
    }
    if (terminal) {
      params.set('bottom', 'terminal')
    }
  }
  const search = params.toString()
  history.replaceState(history.state, '', search === '' ? '/' : `/?${search}`)
}
