import { spawnSync } from 'node:child_process'
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
import { z } from 'zod'
import { args } from '../args.ts'
import { logger } from '../lib/log.ts'

export const home = args.dir

const lockFile = path.join(home, 'server.pid')
const savedServer = z.object({ port: z.number() }).nullable()
const log = logger.withTag('storage')

mkdirSync(home, { recursive: true })

export const scratchAvailable =
  spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: home })
    .status !== 0

export function listenPort() {
  if (args.command !== 'pair' || args.portGiven) {
    return args.port
  }
  const saved = readSettings('server.json', savedServer, null)
  return saved === null ? args.port : saved.port
}

export function lockHome() {
  lock()
  process.on('exit', () => unlinkSync(lockFile))
}

function lock() {
  try {
    writeFileSync(lockFile, `${process.pid}\n`, { flag: 'wx' })
    return
  } catch (error) {
    if (!hasCode(error, 'EEXIST')) {
      throw error
    }
  }
  const pid = runningPid()
  if (pid !== null) {
    console.error(`offsite is already running for ${home} (pid ${pid})`)
    log.error(`offsite is already running for ${home} (pid ${pid})`)
    process.exit(1)
  }
  try {
    unlinkSync(lockFile)
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) {
      throw error
    }
  }
  lock()
}

export function runningPid() {
  let content
  let modified
  try {
    content = readFileSync(lockFile, 'utf8')
    modified = statSync(lockFile).mtimeMs
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return null
    }
    throw error
  }
  const pid = Number(content)
  const validPid = Number.isInteger(pid) && pid > 0
  const writtenThisBoot = modified > Date.now() - os.uptime() * 1000
  if (validPid && writtenThisBoot && pid !== process.pid && isRunning(pid)) {
    return pid
  }
  return null
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (hasCode(error, 'ESRCH')) {
      return false
    }
    if (hasCode(error, 'EPERM')) {
      return true
    }
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
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export function readSettings<T>(
  name: string,
  schema: z.ZodType<T>,
  defaults: T,
  migrate: (value: unknown) => unknown = (value) => value
) {
  const file = path.join(home, name)
  let saved: unknown
  try {
    saved = readJson(name)
  } catch (error) {
    log.warn(`invalid ${file}, using the defaults:`, error)
    return structuredClone(defaults)
  }
  if (saved === null) {
    return structuredClone(defaults)
  }
  const value = migrate(saved)
  if (value !== saved) {
    writeJson(`${name}.bak`, saved)
    log.info(`migrated ${file}, the old file is in ${file}.bak`)
  }
  let result = schema.safeParse(value)
  if (result.success) {
    if (value !== saved) {
      writeJson(name, result.data)
    }
    return result.data
  }
  while (!result.success) {
    const issue = result.error.issues[0]
    const targets =
      issue.code === 'unrecognized_keys'
        ? issue.keys.map((key) => [...issue.path, key])
        : [issue.path]
    for (const target of targets) {
      const discarded = discard(value, target)
      if (discarded === null) {
        log.warn(
          `invalid ${file}, using the defaults:\n${z.prettifyError(result.error)}`
        )
        return structuredClone(defaults)
      }
      log.warn(
        `${file}: discarded ${discarded.map(String).join('.')} (${issue.message} at ${target.map(String).join('.')})`
      )
    }
    result = schema.safeParse(value)
  }
  writeJson(name, result.data)
  return result.data
}

function discard(value: unknown, target: PropertyKey[]): PropertyKey[] | null {
  const key = target.at(0)
  if (
    key === undefined ||
    typeof value !== 'object' ||
    value === null ||
    !Object.hasOwn(value, key)
  ) {
    return null
  }
  const inner =
    target.length > 1 ? discard(Reflect.get(value, key), target.slice(1)) : null
  if (inner !== null) {
    return [key, ...inner]
  }
  if (Array.isArray(value)) {
    value.splice(Number(key), 1)
  } else {
    Reflect.deleteProperty(value, key)
  }
  return [key]
}

export function writeJson(name: string, value: unknown) {
  let file = path.join(home, name)
  mkdirSync(home, { recursive: true })

  try {
    file = realpathSync(file)
  } catch (error) {
    if (!hasCode(error, 'ENOENT')) {
      throw error
    }
  }

  writeFileSync(`${file}.tmp`, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  })
  renameSync(`${file}.tmp`, file)
}
