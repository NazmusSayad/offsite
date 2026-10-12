import type { Platform } from './config'
import type { Terminal } from './ghostty/terminal'
import { showToast } from './toast'

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

export async function pasteClipboardImages(terminal: Terminal) {
  const images: Blob[] = []
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((type) => type.startsWith('image/'))
    if (type) images.push(await item.getType(type))
  }
  if (images.length === 0) {
    showToast('No image in the clipboard')
    return false
  }
  await pasteImages(terminal, images)
  return true
}

export async function pasteImages(terminal: Terminal, images: Blob[]) {
  const paths: string[] = []
  for (const image of images) {
    const response = await fetch('/api/paste', {
      method: 'POST',
      headers: { 'Content-Type': image.type },
      body: image,
    })
    if (!response.ok) throw new Error(await response.text())
    const path = (await response.json()) as string
    paths.push(/\s/.test(path) ? `"${path}"` : path)
  }
  terminal.paste(paths.join(' '))
}

export function reportPasteError(error: unknown) {
  console.error('could not paste image', error)
  showToast('Could not paste the image')
}
