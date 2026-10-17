import type {
  Method,
  Methods,
  Reply,
  ServerEvent,
  ServerMessage,
} from '@offsite/core/protocol'
import {
  decodeFrame,
  encodeFrame,
  type TerminalEvent,
} from '@offsite/core/terminal'
import { readToken } from '@/lib/tokens'

type Listener = {
  open?: (machine: string, url: string) => void
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
  ping: Promise<boolean> | null
  timer: number | undefined
  failures: number
  pending: Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >
}

const RECONNECT_DELAY = 1000
const RECONNECT_LIMIT = 30_000
const PING_INTERVAL = 10_000
const PING_TIMEOUT = 10_000
const CONNECT_TIMEOUT = 3000
const CALL_TIMEOUT = 30_000
const LONG_CALL_TIMEOUT = 5 * 60_000
const longCalls: Method[] = [
  'sessions.send',
  'sessions.rewind',
  'sessions.fork',
  'git.commit',
  'git.push',
  'git.pullRequest',
  'git.createPullRequest',
]

const listeners = new Set<Listener>()
const connections = new Map<string, Connection>()
let nextId = 0

export function startConnections() {
  window.setInterval(() => {
    for (const machine of connections.keys()) {
      void checkConnection(machine)
    }
  }, PING_INTERVAL)
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
      void checkConnection(machine)
      continue
    }
    if (connection.timer === undefined) {
      continue
    }
    window.clearTimeout(connection.timer)
    connection.timer = undefined
    connection.failures = 0
    void openSocket(machine, connection, 0)
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
    ping: null,
    timer: undefined,
    failures: 0,
    pending: new Map(),
  }
  connections.set(machine, connection)
  void openSocket(machine, connection, 0)
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
}

export function isConnected(machine: string) {
  return connections.get(machine)?.connected === true
}

export function call<M extends Method>(
  machine: string,
  method: M,
  params: Methods[M]['params']
) {
  const connection = connections.get(machine)
  if (
    connection === undefined ||
    connection.socket === null ||
    !connection.connected
  ) {
    return Promise.reject(
      new Error(
        connection === undefined
          ? 'That machine was removed'
          : `Not connected to ${new URL(connection.url).host}; reconnecting`
      )
    )
  }
  nextId += 1
  const id = nextId
  connection.socket.send(JSON.stringify({ id, method, params }))
  const timeout = longCalls.includes(method) ? LONG_CALL_TIMEOUT : CALL_TIMEOUT
  return new Promise<Methods[M]['result']>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      connection.pending.delete(id)
      reject(
        new Error(
          `${new URL(connection.url).host} did not answer ${method} within ${timeout / 1000} seconds`
        )
      )
    }, timeout)
    connection.pending.set(id, {
      resolve: (result) => {
        window.clearTimeout(timer)
        resolve(result as Methods[M]['result'])
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

export async function checkConnection(machine: string) {
  const connection = connections.get(machine)
  if (connection === undefined) {
    return false
  }
  connection.ping ??= pingServer(machine, connection).finally(() => {
    connection.ping = null
  })
  return await connection.ping
}

async function openSocket(
  machine: string,
  connection: Connection,
  attempt: number
) {
  const url = connection.urls[attempt % connection.urls.length]
  connection.url = url
  const ticket = await requestTicket(machine, url).catch(() => undefined)
  if (connections.get(machine) !== connection) {
    return
  }
  if (ticket === 'unpaired') {
    for (const listener of listeners) {
      listener.unpaired?.(machine)
    }
    return
  }
  if (ticket === undefined) {
    failAttempt(machine, connection, attempt)
    return
  }
  const query = ticket === null ? '' : `?${new URLSearchParams({ ticket })}`
  const next = new WebSocket(`${url.replace(/^http/, 'ws')}/ws${query}`)
  next.binaryType = 'arraybuffer'
  const timer = window.setTimeout(() => next.close(), CONNECT_TIMEOUT)
  next.onopen = () => {
    window.clearTimeout(timer)
    connection.connected = true
    connection.failures = 0
    for (const listener of listeners) {
      listener.open?.(machine, url)
    }
  }
  next.onmessage = (event) => receive(machine, connection, event.data)
  next.onclose = () => {
    window.clearTimeout(timer)
    if (connection.connected) {
      disconnect(machine, connection)
      retry(machine, connection, 0)
      return
    }
    failAttempt(machine, connection, attempt)
  }
  connection.socket = next
}

async function requestTicket(machine: string, url: string) {
  const token = await readToken(machine)
  const response = await fetch(`${url}/api/ticket`, {
    method: 'POST',
    headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(CONNECT_TIMEOUT),
  })
  if (response.status === 401) {
    return 'unpaired'
  }
  if (!response.ok) {
    throw new Error(await response.text())
  }
  const body: { ticket: string | null } = await response.json()
  return body.ticket
}

function failAttempt(machine: string, connection: Connection, attempt: number) {
  if ((attempt + 1) % connection.urls.length !== 0) {
    void openSocket(machine, connection, attempt + 1)
    return
  }
  for (const listener of listeners) {
    listener.close?.(machine)
  }
  retry(machine, connection, attempt + 1)
}

function retry(machine: string, connection: Connection, attempt: number) {
  const delay =
    Math.min(RECONNECT_LIMIT, RECONNECT_DELAY * 2 ** connection.failures) *
    (0.8 + Math.random() * 0.4)
  connection.failures += 1
  connection.timer = window.setTimeout(() => {
    connection.timer = undefined
    void openSocket(machine, connection, attempt)
  }, delay)
}

function disconnect(machine: string, connection: Connection) {
  for (const waiter of connection.pending.values()) {
    waiter.reject(
      new Error(`Disconnected from ${new URL(connection.url).host}`)
    )
  }
  connection.pending.clear()
  connection.connected = false
  for (const listener of listeners) {
    listener.close?.(machine)
  }
}

async function pingServer(machine: string, connection: Connection) {
  const current = connection.socket
  if (current === null || !connection.connected) {
    return false
  }
  const alive = await Promise.race([
    call(machine, 'ping', undefined).then(
      () => true,
      () => false
    ),
    new Promise<boolean>((resolve) =>
      window.setTimeout(() => resolve(false), PING_TIMEOUT)
    ),
  ])
  if (alive || connection.socket !== current) {
    return alive
  }
  current.onclose = null
  current.close()
  disconnect(machine, connection)
  if (connections.get(machine) === connection) {
    retry(machine, connection, 0)
  }
  return false
}

function receive(machine: string, connection: Connection, data: unknown) {
  if (data instanceof ArrayBuffer) {
    const frame = decodeFrame(new Uint8Array(data))
    for (const listener of listeners) {
      listener.frame?.(machine, frame)
    }
    return
  }
  const message = JSON.parse(String(data)) as ServerMessage
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

function settle(connection: Connection, reply: Reply) {
  const waiter = connection.pending.get(reply.id)
  if (waiter === undefined) {
    return
  }
  connection.pending.delete(reply.id)
  if ('error' in reply) {
    waiter.reject(new Error(reply.error))
  } else {
    waiter.resolve(reply.result)
  }
}
