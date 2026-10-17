import {
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { consola } from 'consola'
import { args } from '../args.ts'

export const home = args.dir

const lockFile = path.join(home, 'server.pid')

mkdirSync(home, { recursive: true })

export function lockHome() {
  lock()
  process.on('exit', () => unlinkSync(lockFile))
}

function lock() {
  try {
    writeFileSync(lockFile, `${process.pid}\n`, { flag: 'wx' })
    return
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) throw error
  }
  let content
  let modified
  try {
    content = readFileSync(lockFile, 'utf8')
    modified = statSync(lockFile).mtimeMs
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return lock()
    throw error
  }
  const pid = Number(content)
  const validPid = Number.isInteger(pid) && pid > 0
  const writtenThisBoot = modified > Date.now() - os.uptime() * 1000
  if (validPid && writtenThisBoot && pid !== process.pid && isRunning(pid)) {
    consola.error(`offsite is already running for ${home} (pid ${pid})`)
    process.exit(1)
  }
  unlinkSync(lockFile)
  lock()
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (hasCode(error, 'ESRCH')) return false
    if (hasCode(error, 'EPERM')) return true
    throw error
  }
}

export function hasCode(error: unknown, code: string) {
  return error instanceof Error && 'code' in error && error.code === code
}

export function readJson(name: string): unknown {
  try {
    return JSON.parse(readFileSync(path.join(home, name), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export function writeJson(name: string, value: unknown) {
  let file = path.join(home, name)
  mkdirSync(home, { recursive: true })

  try {
    file = realpathSync(file)
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) throw error
  }

  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  })
  renameSync(`${file}.tmp`, file)
}
