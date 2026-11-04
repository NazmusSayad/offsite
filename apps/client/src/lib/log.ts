import { createConsola } from 'consola/browser'
import { type LogObject, LogLevels } from 'consola/core'
import { readToken } from '@/lib/tokens'

type Entry = { time: number; type: string; tag: string; message: string }

const SEND_DELAY = 1000
const RETRY_DELAY = 5000
const QUEUE_LIMIT = 1000

const queue: Entry[] = []
let timer: number | undefined

export const logger = createConsola({ level: LogLevels.verbose, throttle: 0 })
logger.addReporter({ log: enqueue })

const log = logger.withTag('app')

export function startLogging() {
  window.addEventListener('error', (event) =>
    log.error('uncaught error:', event.error ?? event.message)
  )
  window.addEventListener('unhandledrejection', (event) =>
    log.error('unhandled rejection:', event.reason)
  )
  log.info(`started on ${location.origin} in ${navigator.userAgent}`)
}

function enqueue(entry: LogObject) {
  queue.push({
    time: entry.date.getTime(),
    type: entry.type,
    tag: entry.tag,
    message: entry.args.map(format).join(' '),
  })
  if (queue.length > QUEUE_LIMIT) {
    queue.splice(0, queue.length - QUEUE_LIMIT)
  }
  schedule(SEND_DELAY)
}

function schedule(delay: number) {
  timer ??= window.setTimeout(() => void flush(), delay)
}

async function flush() {
  const entries = queue.splice(0)
  let response
  try {
    const machines: { id: string; addresses: string[] }[] = JSON.parse(
      localStorage.getItem('machines') ?? '[]'
    )
    const host = machines.find((machine) =>
      machine.addresses.includes(location.origin)
    )
    const token = host === undefined ? undefined : await readToken(host.id)
    response = await fetch('/api/logs', {
      method: 'POST',
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
      body: JSON.stringify(entries),
    })
  } catch {
    retry(entries)
    return
  }
  if (response.status >= 500) {
    retry(entries)
    return
  }
  timer = undefined
  if (!response.ok) {
    console.warn(
      `the server refused ${entries.length} log entries: ${await response.text()}`
    )
  }
  if (queue.length > 0) {
    schedule(SEND_DELAY)
  }
}

function retry(entries: Entry[]) {
  queue.unshift(...entries)
  if (queue.length > QUEUE_LIMIT) {
    queue.splice(0, queue.length - QUEUE_LIMIT)
  }
  timer = undefined
  schedule(RETRY_DELAY)
}

function format(value: unknown) {
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof Error) {
    if (value.stack !== undefined && value.stack.startsWith(String(value))) {
      return value.stack
    }
    return [String(value), value.stack].join('\n')
  }
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
