import { mediaTypes } from '@offsite/core/media'
import { call, machineUrl } from '@/api/connection'
import type { Place, Selection } from '@/lib/store'

const GITHUB_ATTACHMENT =
  /^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f-]{36}$/i
const GITHUB_LINK_LIFETIME = 25 * 60_000
const githubLinks = new Map<string, { src: Promise<string>; until: number }>()
const MEDIA_LINK_LIFETIME = 25 * 60_000
const mediaLinks = new Map<string, MediaLink>()

export type MediaLink = {
  folder: string
  src: string
  size: { width: number; height: number } | null
  until: number
}

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

export function cachedMediaLink(
  selection: Selection,
  id: string,
  path: string
) {
  const cached = mediaLinks.get(mediaKey(selection, id, path))
  return cached !== undefined && cached.until > Date.now() ? cached : null
}

export function cacheMediaLink(
  selection: Selection,
  id: string,
  path: string,
  link: MediaLink
) {
  mediaLinks.set(mediaKey(selection, id, path), link)
}

export async function mediaLink(place: Place, path: string) {
  const result = await call(place.machine, 'files.media', {
    projectId: place.projectId,
    worktreeId: place.worktreeId,
    path,
  })
  return {
    folder: mediaFolder(place),
    src: `${machineUrl(place.machine)}/api/media?${new URLSearchParams({ token: result.token })}`,
    size: result.size,
    until: Date.now() + MEDIA_LINK_LIFETIME,
  }
}

export async function mediaUrl(place: Place, path: string) {
  return (await mediaLink(place, path)).src
}

export function mediaFolder(place: Place) {
  return `${place.machine} ${place.projectId} ${place.worktreeId}`
}

function mediaKey(selection: Selection, id: string, path: string) {
  return `${mediaFolder(selection)} ${selection.sessionId} ${id} ${path}`
}

export function isGithubAttachment(src: string) {
  return GITHUB_ATTACHMENT.test(src)
}

export function githubMediaUrl(
  machine: string,
  url: string,
  repository: string | null
) {
  const key = `${machine} ${repository} ${url}`
  const link = githubLinks.get(key)
  if (link !== undefined && link.until > Date.now()) {
    return link.src
  }
  const src = loadGithubMediaUrl(machine, url, repository)
  githubLinks.set(key, { src, until: Date.now() + GITHUB_LINK_LIFETIME })
  src.catch(() => githubLinks.delete(key))
  return src
}

async function loadGithubMediaUrl(
  machine: string,
  url: string,
  repository: string | null
) {
  const token = await call(machine, 'pulls.image', { url, repository })
  return `${machineUrl(machine)}/api/github-media?${new URLSearchParams({ token })}`
}

export async function downloadProjectFile(place: Place, path: string) {
  const token = await call(place.machine, 'files.download', {
    projectId: place.projectId,
    worktreeId: place.worktreeId,
    path,
  })
  await downloadFile(
    `${machineUrl(place.machine)}/api/media?${new URLSearchParams({ token })}`,
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
