import { call } from '@/api/connection'
import {
  findTab,
  send,
  sendTo,
  tabTitle,
  terminalConfig,
  terminalMachine,
} from './session'

type Closing = { id: number; name: string; program: string | null }
type MachineTab = { machine: string; id: number }
type ClosingAll = { tabs: MachineTab[]; programs: string[] }

let closing: { open: boolean; closing: Closing } | null = null
let closingAll: { open: boolean; closing: ClosingAll } | null = null
const checking = new Set<number>()
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
  if (closing === null) {
    return
  }
  setClosing({ open: false, closing: closing.closing })
}

export function getClosingAll() {
  return closingAll
}

export function dismissClosingAll() {
  if (closingAll === null) {
    return
  }
  setClosingAll({ open: false, closing: closingAll.closing })
}

function setClosing(next: { open: boolean; closing: Closing }) {
  closing = next
  for (const listener of listeners) {
    listener()
  }
}

function setClosingAll(next: { open: boolean; closing: ClosingAll }) {
  closingAll = next
  for (const listener of listeners) {
    listener()
  }
}

function dialogOpen() {
  return (
    document.querySelector(
      '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
    ) !== null
  )
}

async function busyProgram(machine: string, id: number) {
  try {
    const result = await Promise.race([
      call(machine, 'terminal.busy', { id }),
      new Promise<never>((_resolve, reject) =>
        window.setTimeout(() => reject(new Error('timed out')), 5000)
      ),
    ])
    if ('error' in result) {
      console.error(
        `could not check whether tab ${id} is running a program`,
        result.error
      )
      return { checked: false as const }
    }
    return { checked: true as const, program: result.program }
  } catch (error) {
    console.error('could not check whether a program is running', error)
    return { checked: false as const }
  }
}

export async function closeTab(id: number) {
  if (!terminalConfig().behavior.confirmCloseBusyTab) {
    send({ type: 'closeTab', id })
    return
  }
  const tab = findTab(id)
  if (!tab || checking.has(id)) {
    return
  }
  checking.add(id)
  const busy = await busyProgram(terminalMachine(), id)
  checking.delete(id)
  if (busy.checked && busy.program === null) {
    send({ type: 'closeTab', id })
    return
  }
  const current = findTab(id)
  if (!current || dialogOpen()) {
    return
  }
  setClosing({
    open: true,
    closing: {
      id,
      name: tabTitle(current),
      program: busy.checked ? busy.program : null,
    },
  })
}

export function sendCloseTabs(tabs: MachineTab[]) {
  for (const tab of tabs) {
    sendTo(tab.machine, { type: 'closeTab', id: tab.id })
  }
}

export async function closeTabs(tabs: MachineTab[]) {
  if (!terminalConfig().behavior.confirmCloseBusyTab) {
    sendCloseTabs(tabs)
    return
  }
  const results = await Promise.all(
    tabs.map((tab) => busyProgram(tab.machine, tab.id))
  )
  if (results.every((busy) => busy.checked && busy.program === null)) {
    sendCloseTabs(tabs)
    return
  }
  if (dialogOpen()) {
    return
  }
  const programs = results.flatMap((busy) =>
    busy.checked && busy.program !== null ? [busy.program] : []
  )
  setClosingAll({
    open: true,
    closing: { tabs, programs: [...new Set(programs)] },
  })
}
