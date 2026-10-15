import { randomUUID } from 'node:crypto'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { git } from './git.ts'
import { home } from './storage.ts'

const FILE_LIMIT = 20_000
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

export function saveUpload(name: string, data: Buffer) {
  const dir = path.join(home, 'uploads', randomUUID())
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, path.basename(name))
  writeFileSync(file, data)
  return file
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
        pending.push(relative)
      if (entry.isFile()) files.push(relative)
    }
  }
  return files
}
