import { mediaTypes } from '@offsite/core/media'
import { call, machineUrl } from '@/api/connection'

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
