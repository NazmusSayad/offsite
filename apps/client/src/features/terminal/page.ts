import { GLOBAL_TERMINALS } from '@offsite/core/terminal'
import { call } from '@/api/connection'
import { router } from '@/lib/router'
import { openTerminalPage } from '@/lib/sessions'
import { getState as appState, type Machine } from '@/lib/store'
import { leaveLayer, terminalPage, terminalView } from '@/lib/url'
import { getState, tabView, terminalMachine, viewTabs } from './session'

export function showGroup(target: string, view: string) {
  openTerminalPage(target, view)
}

export function showMachine(target: Machine) {
  const views = target.terminals.map(tabView)
  const last = localStorage.getItem('lastTerminalView')
  showGroup(
    target.id,
    views.find((view) => view === last) ?? views.at(0) ?? GLOBAL_TERMINALS
  )
}

export async function createTab(target: string, projectId: string | null) {
  try {
    await call(target, 'terminal', { type: 'createTab', projectId })
  } catch (error) {
    console.error('terminal request failed', error)
    return
  }
  showGroup(target, projectId ?? GLOBAL_TERMINALS)
}

export function keepPageOpen() {
  const state = getState()
  const page = terminalPage()
  if (page === null || state.instance === null || page !== terminalMachine()) {
    return
  }
  if (viewTabs(state.layout, terminalView()).length > 0) {
    return
  }
  const tab = state.layout.tabs.at(0)
  if (tab !== undefined) {
    showGroup(page, tabView(tab))
    return
  }
  const other = appState().machines.find(
    (item) =>
      item.id !== page && item.status === 'online' && item.terminals.length > 0
  )
  if (other !== undefined) {
    showMachine(other)
    return
  }
  leaveLayer(
    'chat',
    () => void router.navigate({ to: '/', search: {}, replace: true })
  )
}
