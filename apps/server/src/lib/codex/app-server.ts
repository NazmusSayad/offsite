import { type ChildProcessByStdio, spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import type { Readable, Writable } from 'node:stream'
import { publishCodexLimits } from './accounts.ts'
import type { RateLimitSnapshot } from './types.ts'

const IDLE_LIMIT = 30 * 60 * 1000
const START_TIMEOUT = 15_000
const REQUEST_TIMEOUT = 30_000

export type Params = Record<string, unknown>

export type ThreadListener = {
  notify: (method: string, params: Params) => void
  request: (id: number | string, method: string, params: Params) => void
  exited: () => void
}

type Incoming = {
  id?: number | string
  method?: string
  params?: Params
  result?: unknown
  error?: { message: string }
}

export const codexBaseDir =
  process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')

const servers = new Map<string, AppServer>()

export function appServer(home: string) {
  const existing = servers.get(home)
  if (existing !== undefined) return existing
  const server = new AppServer(home)
  servers.set(home, server)
  return server
}

export function stopAppServers() {
  for (const server of servers.values()) server.stop()
}

export function stopAppServer(home: string) {
  servers.get(home)?.stop()
}

export function findCodex() {
  const name = process.platform === 'win32' ? 'codex.exe' : 'codex'
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, name)
    if (statSync(candidate, { throwIfNoEntry: false })?.isFile())
      return candidate
  }
  return null
}

export class AppServer {
  readonly home: string
  readonly threads = new Map<string, ThreadListener>()
  private readonly child: ChildProcessByStdio<Writable, Readable, null>
  private readonly waiting = new Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >()
  private readonly ready: Promise<void>
  private next = 0
  private idleTimer: NodeJS.Timeout | undefined
  private exited: Error | null = null

  constructor(home: string) {
    const executable = findCodex()
    if (executable === null)
      throw new Error('Codex is not installed or not on the PATH')
    this.home = home
    this.child = spawn(executable, ['app-server'], {
      env: { ...process.env, CODEX_HOME: home },
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    readline
      .createInterface({ input: this.child.stdout })
      .on('line', (line) => this.receive(line))
    this.child.on('error', (error) => this.exit(error))
    this.child.on('exit', (code) =>
      this.exit(new Error(`Codex stopped (exit code ${code})`))
    )
    this.ready = this.call(
      'initialize',
      {
        clientInfo: { name: 'offsite', title: 'Offsite', version: '0.0.0' },
        capabilities: { experimentalApi: true, requestAttestation: false },
      },
      START_TIMEOUT
    ).then(
      () => this.write({ method: 'initialized' }),
      (error: unknown) => {
        this.child.kill()
        throw error
      }
    )
    this.armIdleTimer()
  }

  async request<T>(method: string, params: Params): Promise<T> {
    await this.ready
    this.armIdleTimer()
    return (await this.call(method, params, REQUEST_TIMEOUT)) as T
  }

  reply(id: number | string, result: unknown) {
    this.write({ id, result })
  }

  replyError(id: number | string, message: string) {
    this.write({ id, error: { code: -32000, message } })
  }

  stop() {
    clearTimeout(this.idleTimer)
    if (servers.get(this.home) === this) servers.delete(this.home)
    this.child.stdin.end()
  }

  private call(method: string, params: Params, timeout: number) {
    if (this.exited !== null) return Promise.reject(this.exited)
    this.next += 1
    const id = this.next
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id)
        reject(
          new Error(
            `Codex did not answer ${method} within ${timeout / 1000} seconds`
          )
        )
      }, timeout)
      this.waiting.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
    })
    this.write({ id, method, params })
    return result
  }

  private write(message: Params) {
    if (this.exited !== null) return
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  private receive(line: string) {
    let message: Incoming
    try {
      message = JSON.parse(line) as Incoming
    } catch {
      console.warn(`ignoring a Codex line that is not JSON: ${line}`)
      return
    }
    if (message.method === undefined) {
      if (typeof message.id !== 'number') return
      const waiter = this.waiting.get(message.id)
      if (waiter === undefined) return
      this.waiting.delete(message.id)
      if (message.error !== undefined)
        waiter.reject(new Error(message.error.message))
      else waiter.resolve(message.result)
      return
    }
    const params = message.params ?? {}
    const listener =
      typeof params.threadId === 'string'
        ? this.threads.get(params.threadId)
        : undefined
    if (message.id !== undefined) {
      if (listener === undefined)
        this.replyError(message.id, `offsite does not handle ${message.method}`)
      else listener.request(message.id, message.method, params)
      return
    }
    if (message.method === 'account/rateLimits/updated') {
      publishCodexLimits(this.home, params.rateLimits as RateLimitSnapshot)
      return
    }
    listener?.notify(message.method, params)
  }

  private armIdleTimer() {
    clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      if (this.threads.size > 0) this.armIdleTimer()
      else this.stop()
    }, IDLE_LIMIT)
  }

  private exit(error: Error) {
    if (this.exited !== null) return
    this.exited = error
    clearTimeout(this.idleTimer)
    if (servers.get(this.home) === this) servers.delete(this.home)
    for (const waiter of this.waiting.values()) waiter.reject(error)
    this.waiting.clear()
    for (const listener of this.threads.values()) listener.exited()
    this.threads.clear()
  }
}
