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
import { z } from 'zod'
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
    if (!hasCode(error, 'EEXIST')) {
      throw error
    }
  }
  let content
  let modified
  try {
    content = readFileSync(lockFile, 'utf8')
    modified = statSync(lockFile).mtimeMs
  } catch (error) {
    if (hasCode(error, 'ENOENT')) {
      return lock()
    }
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
  defaults: T
) {
  const file = path.join(home, name)
  let value: unknown
  try {
    value = readJson(name)
  } catch (error) {
    console.warn(`invalid ${file}, using the defaults: ${error}`)
    return structuredClone(defaults)
  }
  if (value === null) {
    return structuredClone(defaults)
  }
  let result = schema.safeParse(value)
  if (result.success) {
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
        console.warn(
          `invalid ${file}, using the defaults:\n${z.prettifyError(result.error)}`
        )
        return structuredClone(defaults)
      }
      console.warn(
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
