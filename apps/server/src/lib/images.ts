import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ImageAttachment } from '@offsite/core/items'

const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export async function saveImage(sessionId: string, image: ImageAttachment) {
  const extension = extensions[image.mediaType]
  if (extension === undefined) {
    throw new Error(`${image.mediaType} images are not supported`)
  }
  const directory = path.join(os.tmpdir(), 'offsite', sessionId, 'images')
  await mkdir(directory, { recursive: true })
  const file = path.join(directory, `${randomUUID()}.${extension}`)
  await writeFile(file, Buffer.from(image.data, 'base64'))
  return file
}
