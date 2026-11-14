import type { TerminalPlace } from '@offsite/core/terminal'
import { call } from '@/api/connection'
import { logger } from '@/lib/log'
import { router } from '@/lib/router'
import { openTerminalPage } from '@/lib/sessions'
import { getState as appState, type Machine } from '@/lib/store'
import { terminalPage, terminalView } from '@/lib/url'
import { getState, tabView, terminalMachine, viewTabs } from './session'

const log = logger.withTag('terminal')

export function showGroup(target: string, place: TerminalPlace) {
  openTerminalPage(target, place)
}

export function showMachine(target: Machine) {
  const last = localStorage.getItem('lastTerminalView')
  showGroup(
    target.id,
    target.terminals.find((tab) => tabView(tab) === last) ??
      target.terminals.at(0) ?? { projectId: null, worktreeId: null }
  )
}

export async function createTab(target: string, place: TerminalPlace) {
  try {
    await call(target, 'terminal', {
      type: 'createTab',
      projectId: place.projectId,
      worktreeId: place.worktreeId,
    })
  } catch (error) {
    log.error('terminal request failed', error)
    return
  }
  showGroup(target, place)
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
    showGroup(page, tab)
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
  void router.navigate({ to: '/', search: {}, replace: true })
}
