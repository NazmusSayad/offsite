import { lstat, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { logFolder } from '../../lib/log.ts'
import { hasCode, home } from '../../storage/storage.ts'

const DAY = 86_400_000
const groups = {
  uploads: {
    folder: path.join(home, 'uploads'),
    names: /^[0-9a-f-]{36}$/,
    age: 30 * DAY,
  },
  pasted: {
    folder: path.join(home, 'paste'),
    names: /^\d+-[0-9a-f-]{36}\.[a-z]+$/,
    age: DAY,
  },
  logs: {
    folder: path.join(home, 'logs'),
    names: /^\d+-\d+$/,
    age: 30 * DAY,
  },
}

export type FileGroup = keyof typeof groups

export async function folderStats(entry: string) {
  let stats
  try {
    stats = await lstat(entry)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return { bytes: 0, changedAt: 0 }
    }
    throw error
  }
  if (!stats.isDirectory()) {
    return { bytes: stats.size, changedAt: stats.mtimeMs }
  }
  const children = await Promise.all(
    (await entries(entry)).map((name) => folderStats(path.join(entry, name)))
  )
  let bytes = 0
  let changedAt = stats.mtimeMs
  for (const child of children) {
    bytes += child.bytes
    changedAt = Math.max(changedAt, child.changedAt)
  }
  return { bytes, changedAt }
}

export async function entries(folder: string) {
  try {
    return await readdir(folder)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return []
    }
    throw error
  }
}

export async function oldFiles(group: FileGroup, now: number) {
  const settings = groups[group]
  const found = await Promise.all(
    (await entries(settings.folder))
      .filter((name) => settings.names.test(name))
      .map((name) => path.join(settings.folder, name))
      .filter((file) => file !== logFolder)
      .map(async (file) => ({ file, ...(await folderStats(file)) }))
  )
  return found.filter((item) => now - item.changedAt >= settings.age)
}

export async function fileGroupItem(group: FileGroup, now: number) {
  const found = await oldFiles(group, now)
  if (found.length === 0) {
    return null
  }
  return {
    id: group,
    kind: group,
    count: found.length,
    bytes: found.reduce((total, item) => total + item.bytes, 0),
  }
}

export async function deleteOldFiles(group: FileGroup, now: number) {
  for (const item of await oldFiles(group, now)) {
    await rm(item.file, { recursive: true, force: true })
  }
}
