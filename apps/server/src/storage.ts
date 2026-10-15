import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const home = path.join(os.homedir(), '.offsite')

export function readJson(name: string): unknown {
  try {
    return JSON.parse(readFileSync(path.join(home, name), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export function writeJson(name: string, value: unknown) {
  const file = path.join(home, name)
  mkdirSync(home, { recursive: true })
  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  })
  renameSync(`${file}.tmp`, file)
}
