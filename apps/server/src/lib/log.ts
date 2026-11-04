import { mkdirSync, openSync, writeSync } from 'node:fs'
import path from 'node:path'
import { formatWithOptions } from 'node:util'
import { createConsola, type LogObject, LogLevels } from 'consola'
import { args } from '../args.ts'

const folder = path.join(args.dir, 'logs', `${Date.now()}-${process.pid}`)
const files = new Map<string, number>()

function write(file: string, entry: LogObject) {
  let descriptor = files.get(file)
  if (descriptor === undefined) {
    mkdirSync(folder, { recursive: true, mode: 0o700 })
    descriptor = openSync(path.join(folder, file), 'a', 0o600)
    files.set(file, descriptor)
  }
  const tag = entry.tag === '' ? '' : ` [${entry.tag}]`
  const message = formatWithOptions(
    { colors: false, breakLength: Infinity },
    ...entry.args
  )
  writeSync(
    descriptor,
    `${entry.date.toISOString()} ${entry.type.toUpperCase()}${tag} ${message}\n`
  )
}

function fileLogger(file: string) {
  return createConsola({
    level: LogLevels.verbose,
    throttle: 0,
    reporters: [{ log: (entry) => write(file, entry) }],
  })
}

export const logger = fileLogger('server.log')
export const browserLogger = fileLogger('browser.log')
