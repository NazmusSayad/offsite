import type { ClipboardRead } from './config'

type Request = { id: number; reply: (text: string) => void }

const listeners = new Set<() => void>()
let request: Request | null = null

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
  if (request !== null) return
  setRequest({ id, reply })
}

export function answerClipboardRead(allowed: boolean) {
  if (request === null) return
  const reply = request.reply
  setRequest(null)
  if (allowed) void replyWithClipboard(reply)
  else reply('')
}

async function replyWithClipboard(reply: (text: string) => void) {
  if (!window.isSecureContext) {
    console.warn('programs can read the clipboard only over https or localhost')
    reply('')
    return
  }
  try {
    reply(await navigator.clipboard.readText())
  } catch (error) {
    console.warn('could not read the clipboard', error)
    reply('')
  }
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
