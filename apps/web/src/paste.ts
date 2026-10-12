import type { Terminal } from './ghostty/terminal'

export function isCtrlV(event: KeyboardEvent) {
  return (
    event.key.toLowerCase() === 'v' &&
    event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey
  )
}

export async function pasteClipboardImages(terminal: Terminal) {
  const images: Blob[] = []
  for (const item of await navigator.clipboard.read()) {
    const type = item.types.find((type) => type.startsWith('image/'))
    if (type) images.push(await item.getType(type))
  }
  if (images.length === 0) return false
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
