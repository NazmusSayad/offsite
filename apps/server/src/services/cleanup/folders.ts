import { realpathSync } from 'node:fs'
import { lstat, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { logFolder, logger } from '../../lib/log.ts'
import { db } from '../../storage/db.ts'
import { outbox } from '../../storage/schema.ts'
import { hasCode, home } from '../../storage/storage.ts'

const DAY = 86_400_000
const log = logger.withTag('cleanup')
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
  let bytes = 0
  let changedAt = 0
  const pending = [entry]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    let stats
    try {
      stats = await lstat(next)
    } catch (error) {
      if (hasCode(error, 'ENOENT')) {
        continue
      }
      throw error
    }
    changedAt = Math.max(changedAt, stats.mtimeMs)
    if (stats.isDirectory()) {
      for (const name of await entries(next)) {
        pending.push(path.join(next, name))
      }
    } else if (stats.nlink === 1) {
      bytes += stats.size
    }
  }
  return { bytes, changedAt }
}

export async function entries(folder: string) {
  try {
    return await readdir(folder)
  } catch (error) {
    if (hasCode(error, 'ENOENT') || hasCode(error, 'ENOTDIR')) {
      return []
    }
    throw error
  }
}

export function realPath(entry: string) {
  try {
    return realpathSync.native(entry)
  } catch (error) {
    if (
      hasCode(error, 'ENOENT') ||
      hasCode(error, 'ENOTDIR') ||
      hasCode(error, 'EACCES') ||
      hasCode(error, 'EPERM')
    ) {
      return path.resolve(entry)
    }
    throw error
  }
}

export function inside(child: string, parent: string) {
  return (
    child === parent ||
    child.startsWith(
      parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`
    )
  )
}

async function oldFiles(group: FileGroup, now: number) {
  const settings = groups[group]
  const waiting =
    group === 'uploads'
      ? JSON.stringify(
          db.select({ request: outbox.request }).from(outbox).all()
        )
      : ''
  const found: { file: string; bytes: number }[] = []
  for (const name of await entries(settings.folder)) {
    const file = path.join(settings.folder, name)
    if (
      !settings.names.test(name) ||
      file === logFolder ||
      (group === 'uploads' && waiting.includes(name))
    ) {
      continue
    }
    try {
      const stats = await folderStats(file)
      if (now - stats.changedAt >= settings.age) {
        found.push({ file, bytes: stats.bytes })
      }
    } catch (error) {
      log.warn(`could not check ${file}:`, error)
    }
  }
  return found
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
  const failed: string[] = []
  for (const item of await oldFiles(group, now)) {
    try {
      await rm(item.file, { recursive: true, force: true })
    } catch (error) {
      log.warn(`could not delete ${item.file}:`, error)
      failed.push(item.file)
    }
  }
  if (failed.length > 0) {
    throw new Error(`could not delete ${failed.join(', ')}`)
  }
}
