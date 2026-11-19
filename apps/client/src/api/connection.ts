import {
  NEEDS_PAIRING,
  type RpcMethod,
  type RpcMethods,
  type RpcReply,
  type ServerEvent,
  type ServerMessage,
  type SyncSnapshot,
} from '@offsite/core/protocol'
import {
  decodeFrame,
  encodeFrame,
  type TerminalEvent,
} from '@offsite/core/terminal'
import { logger } from '@/lib/log'
import { readToken } from '@/lib/tokens'

type Listener = {
  open?: (machine: string, url: string, snapshot: SyncSnapshot) => void
  close?: (machine: string) => void
  unpaired?: (machine: string) => void
  event?: (machine: string, event: ServerEvent) => void
  terminal?: (machine: string, event: TerminalEvent) => void
  frame?: (machine: string, frame: ReturnType<typeof decodeFrame>) => void
}

type Connection = {
  urls: string[]
  url: string
  socket: WebSocket | null
  connected: boolean
  heardAt: number
  timer: number | undefined
  failures: number
  pending: Map<
    number,
    {
      key: string | null
      resolve: (result: unknown) => void
      reject: (error: Error) => void
    }
  >
  reused: Map<string, { hash: string; result: unknown }>
}

const RECONNECT_DELAY = 1000
const RECONNECT_LIMIT = 30_000
const CHECK_INTERVAL = 2000
const SILENCE_LIMIT = 10_000
const CONNECT_TIMEOUT = 3000
const CALL_TIMEOUT = 30_000
const LONG_CALL_TIMEOUT = 5 * 60_000
const longCalls: RpcMethod[] = [
  'accounts.link',
  'sessions.send',
  'sessions.resend',
  'sessions.rewind',
  'sessions.fork',
  'git.commit',
  'git.push',
  'git.pullRequest',
  'git.createPullRequest',
  'pulls.run',
  'pulls.writeGuide',
  'files.upload',
  'dictation.transcribe',
  'service.install',
  'service.update',
  'cleanup.check',
  'cleanup.run',
]
const reusedCalls: RpcMethod[] = [
  'git.status',
  'git.changes',
  'git.diff',
  'tasks.output',
]

const log = logger.withTag('connection')
const listeners = new Set<Listener>()
const connections = new Map<string, Connection>()
let nextId = 0

export class ConnectionError extends Error {}

export class DisconnectedError extends ConnectionError {}

export function startConnections() {
  window.setInterval(() => {
    for (const machine of connections.keys()) {
      checkConnection(machine)
    }
  }, CHECK_INTERVAL)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      return
    }
    wake()
  })
  window.addEventListener('online', wake)
}

function wake() {
  for (const [machine, connection] of connections) {
    if (connection.connected) {
      checkConnection(machine)
      continue
    }
    if (connection.timer === undefined) {
      continue
    }
    window.clearTimeout(connection.timer)
    connection.timer = undefined
    connection.failures = 0
    void openSockets(machine, connection)
  }
}

export function connectMachine(machine: string, urls: string[]) {
  if (connections.has(machine)) {
    return
  }
  const connection: Connection = {
    urls,
    url: urls[0],
    socket: null,
    connected: false,
    heardAt: 0,
    timer: undefined,
    failures: 0,
    pending: new Map(),
    reused: new Map(),
  }
  connections.set(machine, connection)
  void openSockets(machine, connection)
}

export function disconnectMachine(machine: string) {
  const connection = connections.get(machine)
  if (connection === undefined) {
    return
  }
  connections.delete(machine)
  window.clearTimeout(connection.timer)
  if (connection.socket !== null) {
    connection.socket.onclose = null
    connection.socket.close()
  }
  disconnect(machine, connection)
}

export function listen(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function isConnected(machine: string) {
  return connections.get(machine)?.connected === true
}

export function machineUrl(machine: string) {
  const connection = connections.get(machine)
  if (connection === undefined) {
    throw new Error('This machine is not connected')
  }
  return connection.url
}

export function call<M extends RpcMethod>(
  machine: string,
  method: M,
  params: RpcMethods[M]['params']
) {
  const connection = connections.get(machine)
  if (
    connection === undefined ||
    connection.socket === null ||
    !connection.connected
  ) {
    return Promise.reject(
      connection === undefined
        ? new Error('That machine was removed')
        : new ConnectionError(
            `Not connected to ${new URL(connection.url).host}; reconnecting`
          )
    )
  }
  nextId += 1
  const id = nextId
  const key = reusedCalls.includes(method)
    ? `${method} ${JSON.stringify(params)}`
    : null
  connection.socket.send(
    JSON.stringify(
      key === null
        ? { id, method, params }
        : {
            id,
            method,
            params,
            known: connection.reused.get(key)?.hash ?? null,
          }
    )
  )
  const timeout = longCalls.includes(method) ? LONG_CALL_TIMEOUT : CALL_TIMEOUT
  return new Promise<RpcMethods[M]['result']>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      connection.pending.delete(id)
      reject(
        new Error(
          `${new URL(connection.url).host} did not answer ${method} within ${timeout / 1000} seconds`
        )
      )
    }, timeout)
    connection.pending.set(id, {
      key,
      resolve: (result) => {
        window.clearTimeout(timer)
        resolve(result as RpcMethods[M]['result'])
      },
      reject: (error) => {
        window.clearTimeout(timer)
        reject(error)
      },
    })
  })
}

export function sendFrame(
  machine: string,
  kind: number,
  id: number,
  data: Uint8Array
) {
  const connection = connections.get(machine)
  if (
    connection === undefined ||
    connection.socket === null ||
    !connection.connected
  ) {
    return
  }
  connection.socket.send(encodeFrame(kind, id, data))
}

function checkConnection(machine: string) {
  const connection = connections.get(machine)
  if (
    connection === undefined ||
    connection.socket === null ||
    !connection.connected ||
    Date.now() - connection.heardAt < SILENCE_LIMIT
  ) {
    return
  }
  log.warn(`${connection.url} went quiet, reconnecting`)
  connection.socket.onclose = null
  connection.socket.close()
  disconnect(machine, connection)
  void openSockets(machine, connection)
}

async function openSockets(machine: string, connection: Connection) {
  const token = await readToken(machine)
  if (connections.get(machine) !== connection) {
    return
  }
  log.debug(`connecting to ${connection.urls.join(', ')}`)
  const attempts = new Set<WebSocket>()
  let unpaired = false
  for (const url of connection.urls) {
    const socket = new WebSocket(`${url.replace(/^http/, 'ws')}/ws`)
    socket.binaryType = 'arraybuffer'
    attempts.add(socket)
    let timer = window.setTimeout(() => socket.close(), CONNECT_TIMEOUT)
    socket.onopen = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => socket.close(), CALL_TIMEOUT)
      socket.send(JSON.stringify(token === undefined ? {} : { key: token }))
    }
    socket.onmessage = (event) => {
      if (connection.socket === socket) {
        receive(machine, connection, event.data)
        return
      }
      if (
        connection.socket !== null ||
        connections.get(machine) !== connection
      ) {
        socket.close()
        return
      }
      const message = JSON.parse(String(event.data)) as ServerMessage
      if (message.type !== 'welcome') {
        return
      }
      window.clearTimeout(timer)
      for (const other of attempts) {
        if (other !== socket) {
          other.close()
        }
      }
      connection.socket = socket
      connection.url = url
      connection.connected = true
      connection.heardAt = Date.now()
      connection.failures = 0
      log.info(`connected to ${url}`)
      for (const listener of listeners) {
        listener.open?.(machine, url, message.snapshot)
      }
    }
    socket.onclose = (event) => {
      window.clearTimeout(timer)
      if (connection.socket === socket) {
        log.info(`the connection to ${url} closed (code ${event.code})`)
        disconnect(machine, connection)
        retry(machine, connection)
        return
      }
      attempts.delete(socket)
      if (event.code === NEEDS_PAIRING) {
        log.warn(`${url} says this browser is not paired`)
        unpaired = true
      }
      if (
        attempts.size > 0 ||
        connection.socket !== null ||
        connections.get(machine) !== connection
      ) {
        return
      }
      if (unpaired) {
        for (const listener of listeners) {
          listener.unpaired?.(machine)
        }
        return
      }
      for (const listener of listeners) {
        listener.close?.(machine)
      }
      retry(machine, connection)
    }
  }
}

function retry(machine: string, connection: Connection) {
  const delay =
    Math.min(RECONNECT_LIMIT, RECONNECT_DELAY * 2 ** connection.failures) *
    (0.8 + Math.random() * 0.4)
  connection.failures += 1
  log.debug(
    `reconnecting to ${new URL(connection.url).host} in ${Math.round(delay / 1000)}s`
  )
  connection.timer = window.setTimeout(() => {
    connection.timer = undefined
    void openSockets(machine, connection)
  }, delay)
}

function disconnect(machine: string, connection: Connection) {
  for (const waiter of connection.pending.values()) {
    waiter.reject(
      new DisconnectedError(`Disconnected from ${new URL(connection.url).host}`)
    )
  }
  connection.pending.clear()
  connection.socket = null
  connection.connected = false
  for (const listener of listeners) {
    listener.close?.(machine)
  }
}

function receive(machine: string, connection: Connection, data: unknown) {
  connection.heardAt = Date.now()
  if (data instanceof ArrayBuffer) {
    const frame = decodeFrame(new Uint8Array(data))
    for (const listener of listeners) {
      listener.frame?.(machine, frame)
    }
    return
  }
  const message = JSON.parse(String(data)) as ServerMessage
  if (message.type === 'alive' || message.type === 'welcome') {
    return
  }
  if (message.type === 'reply') {
    settle(connection, message)
    return
  }
  if (message.type === 'terminal') {
    for (const listener of listeners) {
      listener.terminal?.(machine, message.event)
    }
    return
  }
  for (const listener of listeners) {
    listener.event?.(machine, message)
  }
}

function settle(connection: Connection, reply: RpcReply) {
  const waiter = connection.pending.get(reply.id)
  if (waiter === undefined) {
    return
  }
  connection.pending.delete(reply.id)
  if ('error' in reply) {
    waiter.reject(new Error(reply.error))
    return
  }
  if ('unchanged' in reply) {
    const saved =
      waiter.key === null ? undefined : connection.reused.get(waiter.key)
    if (saved === undefined) {
      waiter.reject(
        new Error('the machine said nothing changed, but nothing was saved')
      )
      return
    }
    waiter.resolve(saved.result)
    return
  }
  if (waiter.key !== null && reply.hash !== undefined) {
    connection.reused.set(waiter.key, {
      hash: reply.hash,
      result: reply.result,
    })
  }
  waiter.resolve(reply.result)
}
