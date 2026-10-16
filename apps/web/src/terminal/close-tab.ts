import { call } from '@/connection'
import {
  findProject,
  send,
  tabTitle,
  terminalConfig,
  terminalMachine,
} from './session'

export type Closing = { id: number; name: string; program: string | null }

let closing: { open: boolean; closing: Closing } | null = null
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
  return findProject(id)?.project.tabs.find((item) => item.id === id)
}

async function busyProgram(id: number) {
  try {
    const result = await Promise.race([
      call(terminalMachine(), 'terminal.busy', { id }),
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
  if (!tab || checking.has(id)) return
  checking.add(id)
  const busy = await busyProgram(id)
  checking.delete(id)
  if (busy.checked && busy.program === null) {
    send({ type: 'closeTab', id })
    return
  }
  const current = findTab(id)
  if (!current || dialogOpen()) return
  setClosing({
    open: true,
    closing: {
      id,
      name: tabTitle(current),
      program: busy.checked ? busy.program : null,
    },
  })
}
