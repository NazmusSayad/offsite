import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { mediaTypes } from '@offsite/core/media'
import { home } from '../storage/storage.ts'
import { addLink } from './files.ts'
import { gh } from './pull-requests.ts'

const ATTACHMENT_URL =
  /^https:\/\/github\.com\/user-attachments\/assets\/([0-9a-f-]{36})$/i
const LINK_REUSE = 30 * 60_000
const imageRoot = path.join(home, 'github-images')
const downloads = new Map<string, Promise<string>>()
const links = new Map<string, { token: string; until: number }>()

export async function linkGithubImage(url: string, device: string | null) {
  const id = ATTACHMENT_URL.exec(url)?.[1]?.toLowerCase()
  if (id === undefined) {
    throw new Error(`${url} is not a GitHub attachment`)
  }
  const key = `${device} ${id}`
  const link = links.get(key)
  if (link !== undefined && link.until > Date.now()) {
    return link.token
  }
  const file = savedImage(id) ?? (await downloadOnce(id, url))
  const mediaType = mediaTypes.get(path.extname(file))
  if (mediaType === undefined) {
    throw new Error(`unknown media type for ${file}`)
  }
  const token = addLink(file, mediaType, device)
  links.set(key, { token, until: Date.now() + LINK_REUSE })
  return token
}

function savedImage(id: string) {
  const dir = path.join(imageRoot, id)
  if (!existsSync(dir)) {
    return null
  }
  const name = readdirSync(dir).find((entry) => entry.startsWith('image.'))
  return name === undefined ? null : path.join(dir, name)
}

async function downloadOnce(id: string, url: string) {
  const running = downloads.get(id)
  if (running !== undefined) {
    return running
  }
  const download = downloadImage(id, url)
  downloads.set(id, download)
  try {
    return await download
  } finally {
    downloads.delete(id)
  }
}

async function downloadImage(id: string, url: string) {
  const token = (await gh(os.homedir(), ['auth', 'token'])).trim()
  const response = await fetch(url, {
    headers: { authorization: `token ${token}` },
  })
  if (!response.ok) {
    throw new Error(`GitHub answered ${response.status} for ${url}`)
  }
  const mediaType = response.headers.get('content-type')?.split(';')[0].trim()
  const extension = [...mediaTypes].find((entry) => entry[1] === mediaType)?.[0]
  if (extension === undefined) {
    throw new Error(`GitHub sent ${mediaType} for ${url}, which is not media`)
  }
  const dir = path.join(imageRoot, id)
  mkdirSync(dir, { recursive: true })
  const partial = path.join(dir, 'download')
  writeFileSync(partial, Buffer.from(await response.arrayBuffer()))
  const file = path.join(dir, `image${extension}`)
  renameSync(partial, file)
  return file
}
