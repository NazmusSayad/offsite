import { getState, send, type Tab, tabTitle } from './session'

export type BusyTab = { id: number; name: string; program: string | null }
export type Closing =
  | { target: 'tab'; id: number; name: string; program: string | null }
  | { target: 'group'; id: number; name: string; busy: BusyTab[] | null }

let closing: { open: boolean; closing: Closing } | null = null
const checkingTabs = new Set<number>()
const checkingGroups = new Set<number>()
const listeners = new Set<() => void>()

export function subscribeClosing(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getClosing() {
  return closing
}

export function dismissClosing() {
  if (closing === null) return
  setClosing({ open: false, closing: closing.closing })
}

function setClosing(next: { open: boolean; closing: Closing }) {
  closing = next
  for (const listener of listeners) listener()
}

function dialogOpen() {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
    ) !== null
  )
}

function findTab(id: number) {
  return getState()
    .layout.groups.flatMap((group) => group.tabs)
    .find((item) => item.id === id)
}

function findGroup(id: number) {
  return getState().layout.groups.find((item) => item.id === id)
}

async function busyTabs(tabs: Tab[]) {
  if (tabs.length === 0) return []
  try {
    const ids = tabs.map((tab) => tab.id).join(',')
    const response = await fetch(`/api/tabs/${ids}/busy`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok)
      throw new Error(`${response.status} ${await response.text()}`)
    const results = (await response.json()) as Record<
      string,
      { Ok: string | null } | { Err: string }
    >
    return tabs.flatMap((tab): BusyTab[] => {
      const result = results[tab.id]
      if (result === undefined) throw new Error(`no result for tab ${tab.id}`)
      if ('Err' in result) {
        console.error(
          `could not check whether tab ${tab.id} is running a program`,
          result.Err
        )
        return [{ id: tab.id, name: tabTitle(tab), program: null }]
      }
      if (result.Ok === null) return []
      return [{ id: tab.id, name: tabTitle(tab), program: result.Ok }]
    })
  } catch (error) {
    console.error('could not check whether a program is running', error)
    return null
  }
}

export async function closeTab(id: number) {
  if (!getState().config.behavior.confirmCloseBusyTab) {
    send({ type: 'closeTab', id })
    return
  }
  const tab = findTab(id)
  if (!tab || checkingTabs.has(id)) return
  checkingTabs.add(id)
  const busy = await busyTabs([tab])
  checkingTabs.delete(id)
  if (busy !== null && busy.length === 0) {
    send({ type: 'closeTab', id })
    return
  }
  const current = findTab(id)
  if (!current || dialogOpen()) return
  setClosing({
    open: true,
    closing: {
      target: 'tab',
      id,
      name: tabTitle(current),
      program: busy === null ? null : busy[0].program,
    },
  })
}

export async function closeGroup(id: number) {
  const group = findGroup(id)
  if (!group) return
  if (!getState().config.behavior.confirmCloseBusyTab) {
    setClosing({
      open: true,
      closing: { target: 'group', id, name: group.name, busy: [] },
    })
    return
  }
  if (checkingGroups.has(id)) return
  checkingGroups.add(id)
  const busy = await busyTabs(group.tabs)
  checkingGroups.delete(id)
  const current = findGroup(id)
  if (!current || dialogOpen()) return
  setClosing({
    open: true,
    closing: { target: 'group', id, name: current.name, busy },
  })
}
