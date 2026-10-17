import { randomUUID } from 'node:crypto'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'
import type { FilePreview } from '@offsite/core/protocol'
import { hasCode, home } from '../storage/storage.ts'
import { git } from './git.ts'

const FILE_LIMIT = 20_000
const OUTPUT_LIMIT = 256 * 1024
const READ_LIMIT = 1024 * 1024
const images = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
])
const skipped = new Set(['node_modules', '.git', 'dist', 'target', '.next'])

export async function listFiles(cwd: string) {
  try {
    const { stdout } = await git(cwd, [
      'ls-files',
      '--cached',
      '--others',
      '--exclude-standard',
    ])
    return stdout.split('\n').filter(Boolean).slice(0, FILE_LIMIT)
  } catch {
    return walk(cwd)
  }
}

export function readProjectFile(cwd: string, file: string): FilePreview {
  const root = realpathSync(cwd)
  const full = realpathSync(path.resolve(root, file))
  const relative = path.relative(root, full)
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    {throw new Error(`${file} is outside the project`)}
  const stats = statSync(full)
  if (!stats.isFile()) {throw new Error(`${file} is not a file`)}
  if (stats.size > READ_LIMIT)
    {return { kind: 'large', size: stats.size, limit: READ_LIMIT }}
  const data = readFileSync(full)
  const mediaType = images.get(path.extname(full).toLowerCase())
  if (mediaType !== undefined)
    {return {
      kind: 'image',
      size: stats.size,
      mediaType,
      data: data.toString('base64'),
    }}
  if (data.includes(0)) {return { kind: 'binary', size: stats.size }}
  return { kind: 'text', size: stats.size, content: data.toString('utf8') }
}

export function saveUpload(name: string, data: Buffer) {
  const dir = path.join(home, 'uploads', randomUUID())
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, path.basename(name))
  writeFileSync(file, data)
  return file
}

export async function taskOutput(sessionId: string, file: string) {
  const tasks = path.dirname(file)
  if (
    !/^[\w-]+$/.test(sessionId) ||
    !path.isAbsolute(file) ||
    path.normalize(file) !== file ||
    !/^\w+\.output$/.test(path.basename(file)) ||
    path.basename(tasks) !== 'tasks' ||
    path.basename(path.dirname(tasks)) !== sessionId
  )
    {throw new Error('Not a background task output file of this thread')}
  let stats
  try {
    stats = await lstat(file)
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {return null}
    throw error
  }
  if (!stats.isFile())
    {throw new Error('Background task output is not a regular file')}
  const start = Math.max(0, stats.size - OUTPUT_LIMIT)
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.alloc(stats.size - start)
    const read = await handle.read(buffer, 0, buffer.length, start)
    return {
      text: buffer.subarray(0, read.bytesRead).toString('utf8'),
      truncated: start > 0,
    }
  } finally {
    await handle.close()
  }
}

function walk(root: string) {
  const files: string[] = []
  const pending = ['']
  while (pending.length > 0 && files.length < FILE_LIMIT) {
    const dir = pending.pop() ?? ''
    let entries
    try {
      entries = readdirSync(path.join(root, dir), { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const relative = dir === '' ? entry.name : `${dir}/${entry.name}`
      if (entry.isDirectory() && !skipped.has(entry.name))
        {pending.push(relative)}
      if (entry.isFile()) {files.push(relative)}
    }
  }
  return files
}
