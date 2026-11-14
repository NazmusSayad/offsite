import { mediaTypes } from '@offsite/core/media'
import { call, machineUrl } from '@/api/connection'

const GITHUB_ATTACHMENT =
  /^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{36}$/i
const GITHUB_LINK_LIFETIME = 25 * 60_000
const githubLinks = new Map<string, { src: Promise<string>; until: number }>()

export function mediaKind(src: string) {
  const extension = /\.[a-z0-9]+$/i.exec(src.split(/[?#]/)[0])?.[0]
  const type =
    extension === undefined
      ? undefined
      : mediaTypes.get(extension.toLowerCase())
  if (type?.startsWith('image/') === true) {
    return 'image'
  }
  if (type?.startsWith('video/') === true) {
    return 'video'
  }
  if (type?.startsWith('audio/') === true) {
    return 'audio'
  }
  return null
}

export async function mediaUrl(
  machine: string,
  projectId: string,
  path: string
) {
  const token = await call(machine, 'files.media', { projectId, path })
  return `${machineUrl(machine)}/api/media?${new URLSearchParams({ token })}`
}

export function isGithubAttachment(src: string) {
  return GITHUB_ATTACHMENT.test(src)
}

export function githubMediaUrl(machine: string, url: string) {
  const key = `${machine} ${url}`
  const link = githubLinks.get(key)
  if (link !== undefined && link.until > Date.now()) {
    return link.src
  }
  const src = loadGithubMediaUrl(machine, url)
  githubLinks.set(key, { src, until: Date.now() + GITHUB_LINK_LIFETIME })
  src.catch(() => githubLinks.delete(key))
  return src
}

async function loadGithubMediaUrl(machine: string, url: string) {
  const token = await call(machine, 'pulls.image', { url })
  return `${machineUrl(machine)}/api/media?${new URLSearchParams({ token })}`
}

export async function downloadProjectFile(
  machine: string,
  projectId: string,
  path: string
) {
  const token = await call(machine, 'files.download', { projectId, path })
  await downloadFile(
    `${machineUrl(machine)}/api/media?${new URLSearchParams({ token })}`,
    path
  )
}

export async function downloadFile(src: string, path: string) {
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  saveBlob(await response.blob(), path)
}

export function saveBlob(blob: Blob, path: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = path.slice(path.lastIndexOf('/') + 1)
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
