import type { ClipboardRead } from './config'
import { getState, subscribe } from './session'
import { showToast } from './toast'

const READ_LIMIT = 1024 * 1024
const DENIED_QUIET = 5000

type Request = { id: number; reply: (text: string) => void }

const listeners = new Set<() => void>()
const deniedAt = new Map<number, number>()
let request: Request | null = null
let watching = false

export function writeClipboard(text: string) {
  if (!window.isSecureContext) {
    console.warn('copy from the terminal needs https or localhost')
    return
  }
  void navigator.clipboard.writeText(text)
}

export function requestClipboardRead(
  id: number,
  setting: ClipboardRead,
  reply: (text: string) => void
) {
  if (setting === 'allow') {
    void replyWithClipboard(reply)
    return
  }
  if (setting === 'deny') return
  if (setting !== 'ask')
    throw new Error(`unknown clipboard read setting ${String(setting)}`)
  const denied = deniedAt.get(id)
  if (denied !== undefined && performance.now() - denied < DENIED_QUIET) {
    deniedAt.set(id, performance.now())
    return
  }
  if (request !== null && request.id !== id) return
  if (!watching) {
    subscribe(cancelWhenHidden)
    watching = true
  }
  setRequest({ id, reply })
}

export function answerClipboardRead(allowed: boolean) {
  if (request === null) return
  const current = request
  setRequest(null)
  if (allowed) void replyWithClipboard(current.reply)
  else deniedAt.set(current.id, performance.now())
}

function cancelWhenHidden() {
  if (request === null) return
  const state = getState()
  const group = state.layout.groups.find(
    (item) => item.id === state.layout.activeGroup
  )
  if (state.status === 'active' && group?.activeTab === request.id) return
  setRequest(null)
}

async function replyWithClipboard(reply: (text: string) => void) {
  if (!window.isSecureContext) {
    console.warn('programs can read the clipboard only over https or localhost')
    showToast('Programs can read the clipboard only over https or localhost')
    return
  }
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch (error) {
    console.warn('could not read the clipboard', error)
    showToast('Could not read the clipboard')
    return
  }
  if (new TextEncoder().encode(text).length > READ_LIMIT) {
    console.warn('the clipboard is over 1 MiB, not replying')
    showToast('The clipboard is too large to share (over 1 MiB)')
    return
  }
  reply(text)
}

function setRequest(next: Request | null) {
  request = next
  for (const listener of listeners) listener()
}

export function subscribeClipboardRead(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function clipboardReadRequest() {
  return request
}
