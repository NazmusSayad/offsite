import { showToast } from './toast'

const READ_LIMIT = 1024 * 1024

export function writeClipboard(text: string) {
  if (!window.isSecureContext) {
    console.warn('copy from the terminal needs https or localhost')
    return
  }
  void navigator.clipboard.writeText(text)
}

export async function readClipboard(reply: (text: string) => void) {
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
