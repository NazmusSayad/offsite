import { getState, send, type Tab, tabTitle } from './session'

export type BusyTab = { id: number; name: string; program: string }

let closing: BusyTab | null = null
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

export function setClosing(next: BusyTab | null) {
  closing = next
  for (const listener of listeners) listener()
}

export async function busyTabs(tabs: Tab[]) {
  if (!getState().config.behavior.confirmCloseBusyTab) return []
  const programs = await Promise.all(
    tabs.map(async (tab) => {
      const response = await fetch(`/api/tabs/${tab.id}/busy`)
      if (!response.ok) throw new Error(await response.text())
      return (await response.json()) as string | null
    })
  )
  return tabs.flatMap((tab, index) => {
    const program = programs[index]
    if (program === null) return []
    return [{ id: tab.id, name: tabTitle(tab), program }]
  })
}

export async function closeTab(id: number) {
  const tab = getState()
    .layout.groups.flatMap((group) => group.tabs)
    .find((item) => item.id === id)
  if (!tab) return
  try {
    const busy = await busyTabs([tab])
    if (busy.length === 0) {
      send({ type: 'closeTab', id })
      return
    }
    setClosing(busy[0])
  } catch (error) {
    console.error('could not check whether the tab is busy', error)
  }
}
