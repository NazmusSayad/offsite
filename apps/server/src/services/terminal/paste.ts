import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { home } from '../../storage/storage.ts'

const pasteTypes: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export function savePastedImage(type: string, data: Buffer) {
  const extension = pasteTypes[type]
  if (extension === undefined) {
    throw new Error('pasted image must be a PNG, JPEG, GIF or WebP image')
  }
  const directory = path.join(home, 'paste')
  mkdirSync(directory, { recursive: true })
  const file = path.join(
    directory,
    `${Date.now()}-${randomUUID()}.${extension}`
  )
  writeFileSync(file, data)
  return file
}
