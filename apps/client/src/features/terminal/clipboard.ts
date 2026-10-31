import type { Platform } from '@offsite/core/config'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { readBase64 } from '@/api/upload'
import type { Terminal } from '@/lib/ghostty/terminal'

const READ_LIMIT = 1024 * 1024

export function writeClipboard(text: string) {
  if (!window.isSecureContext) {
    console.warn('copy from the terminal needs https or localhost')
    return
  }
  navigator.clipboard.writeText(text).catch((error: unknown) => {
    console.warn('could not copy to the clipboard', error)
    toast('Could not copy to the clipboard')
  })
}

export async function readClipboard(reply: (text: string) => void) {
  if (!window.isSecureContext) {
    console.warn('programs can read the clipboard only over https or localhost')
    toast('Programs can read the clipboard only over https or localhost')
    return
  }
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch (error) {
    console.warn('could not read the clipboard', error)
    toast('Could not read the clipboard')
    return
  }
  if (new TextEncoder().encode(text).length > READ_LIMIT) {
    console.warn('the clipboard is over 1 MiB, not replying')
    toast('The clipboard is too large to share (over 1 MiB)')
    return
  }
  reply(text)
}

export const imagePasteKeys: Record<
  Platform,
  { label: string; ctrl: boolean; alt: boolean; data: string }
> = {
  macos: { label: 'Ctrl+V', ctrl: true, alt: false, data: '\x16' },
  linux: { label: 'Ctrl+V', ctrl: true, alt: false, data: '\x16' },
  windows: { label: 'Alt+V', ctrl: false, alt: true, data: '\x1bv' },
}

export function isImagePasteKey(event: KeyboardEvent, platform: Platform) {
  const key = imagePasteKeys[platform]
  return (
    event.key.toLowerCase() === 'v' &&
    event.ctrlKey === key.ctrl &&
    event.altKey === key.alt &&
    !event.shiftKey &&
    !event.metaKey
  )
}

export async function pasteClipboardImages(
  machine: string,
  terminal: Terminal
) {
  const images: Blob[] = []
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((type) => type.startsWith('image/'))
    if (type) {
      images.push(await item.getType(type))
    }
  }
  if (images.length === 0) {
    toast('No image in the clipboard')
    return false
  }
  await pasteImages(machine, terminal, images)
  return true
}

export async function pasteImages(
  machine: string,
  terminal: Terminal,
  images: Blob[]
) {
  const paths: string[] = []
  for (const image of images) {
    const path = await call(machine, 'terminal.paste', {
      type: image.type,
      data: await readBase64(image),
    })
    paths.push(/\s/.test(path) ? `"${path}"` : path)
  }
  terminal.paste(paths.join(' '))
}

export function reportPasteError(error: unknown) {
  console.error('could not paste image', error)
  toast('Could not paste the image')
}
