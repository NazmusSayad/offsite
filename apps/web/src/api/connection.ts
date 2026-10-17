import {
  decodeFrame,
  encodeFrame,
  type Method,
  type Methods,
  PROTOCOL,
  type Reply,
  type ServerEvent,
  type ServerMessage,
  type TerminalEvent,
} from '@offsite/core/protocol'

type Listener = {
  open?: (machine: string, url: string) => void
  close?: (machine: string) => void
  refuse?: (machine: string, reason: Refusal) => void
  event?: (machine: string, event: ServerEvent) => void
  terminal?: (machine: string, event: TerminalEvent) => void
  frame?: (machine: string, frame: ReturnType<typeof decodeFrame>) => void
}

export type Refusal = 'outdated' | 'newer' | 'unauthorized'

type Connection = {
  urls: string[]
  url: string
  token: string | null
  socket: WebSocket | null
  connected: boolean
  ping: Promise<boolean> | null
  timer: number | undefined
  pending: Map<
    number,
    { resolve: (result: unknown) => void; reject: (error: Error) => void }
  >
}

const RECONNECT_DELAY = 1000
const PING_INTERVAL = 30_000
const PING_TIMEOUT = 3000
const CHECK_TIMEOUT = 3000

const listeners = new Set<Listener>()
const connections = new Map<string, Connection>()
let nextId = 0

export function startConnections() {
  window.setInterval(() => {
    for (const machine of connections.keys()) void checkConnection(machine)
  }, PING_INTERVAL)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return
    for (const machine of connections.keys()) void checkConnection(machine)
  })
}

export function connectMachine(
  machine: string,
  urls: string[],
  token: string | null
) {
  if (connections.has(machine)) return
  const connection: Connection = {
    urls,
    url: urls[0],
    token,
    socket: null,
    connected: false,
    ping: null,
    timer: undefined,
    pending: new Map(),
  }
  connections.set(machine, connection)
  void openSocket(machine, connection, 0)
}

export function disconnectMachine(machine: string) {
  const connection = connections.get(machine)
  if (connection === undefined) return
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
  )
    return Promise.reject(
      new Error(
        `Not connected to ${new URL(connection?.url ?? machine).host}; reconnecting`
      )
    )
  nextId += 1
  const id = nextId
  connection.socket.send(JSON.stringify({ id, method, params }))
  return new Promise<Methods[M]['result']>((resolve, reject) =>
    connection.pending.set(id, {
      resolve: (result) => resolve(result as Methods[M]['result']),
      reject,
    })
  )
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
  )
    return
  connection.socket.send(encodeFrame(kind, id, data))
}

export async function checkConnection(machine: string) {
  const connection = connections.get(machine)
  if (connection === undefined) return false
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
  const params = new URLSearchParams({
    protocol: String(PROTOCOL),
    ...(connection.token !== null && { token: connection.token }),
  })
  const refusal = await checkServer(url, params)
  if (connections.get(machine) !== connection) return
  if (refusal !== null) {
    const lastUrl = (attempt + 1) % connection.urls.length === 0
    if (!lastUrl) {
      void openSocket(machine, connection, attempt + 1)
      return
    }
    if (refusal === 'offline')
      for (const listener of listeners) listener.close?.(machine)
    else for (const listener of listeners) listener.refuse?.(machine, refusal)
    if (refusal !== 'unauthorized')
      connection.timer = window.setTimeout(
        () => void openSocket(machine, connection, attempt + 1),
        RECONNECT_DELAY
      )
    return
  }
  const next = new WebSocket(`${url.replace(/^http/, 'ws')}/ws?${params}`)
  next.binaryType = 'arraybuffer'
  next.onopen = () => {
    connection.connected = true
    for (const listener of listeners) listener.open?.(machine, url)
  }
  next.onmessage = (event) => receive(machine, connection, event.data)
  next.onclose = () => {
    disconnect(machine, connection)
    connection.timer = window.setTimeout(
      () => void openSocket(machine, connection, 0),
      RECONNECT_DELAY
    )
  }
  connection.socket = next
}

async function checkServer(url: string, params: URLSearchParams) {
  const signal = AbortSignal.timeout(CHECK_TIMEOUT)
  let response: Response
  try {
    response = await fetch(`${url}/version?${params}`, { signal })
  } catch {
    return 'offline'
  }
  if (!response.ok) return 'offline'
  const server: { protocol: number; authorized: boolean } | null =
    await response.json().catch(() => null)
  if (server === null || server.protocol < PROTOCOL) return 'outdated'
  if (server.protocol > PROTOCOL) return 'newer'
  if (!server.authorized) return 'unauthorized'
  return null
}

function disconnect(machine: string, connection: Connection) {
  for (const waiter of connection.pending.values())
    waiter.reject(
      new Error(`Disconnected from ${new URL(connection.url).host}`)
    )
  connection.pending.clear()
  connection.connected = false
  for (const listener of listeners) listener.close?.(machine)
}

async function pingServer(machine: string, connection: Connection) {
  const current = connection.socket
  if (current === null || !connection.connected) return false
  const alive = await Promise.race([
    call(machine, 'ping', undefined).then(
      () => true,
      () => false
    ),
    new Promise<boolean>((resolve) =>
      window.setTimeout(() => resolve(false), PING_TIMEOUT)
    ),
  ])
  if (alive || connection.socket !== current) return alive
  current.onclose = null
  current.close()
  disconnect(machine, connection)
  if (connections.get(machine) === connection)
    void openSocket(machine, connection, 0)
  return false
}

function receive(machine: string, connection: Connection, data: unknown) {
  if (data instanceof ArrayBuffer) {
    const frame = decodeFrame(new Uint8Array(data))
    for (const listener of listeners) listener.frame?.(machine, frame)
    return
  }
  const message = JSON.parse(String(data)) as ServerMessage
  if (message.type === 'reply') {
    settle(connection, message)
    return
  }
  if (message.type === 'terminal') {
    for (const listener of listeners)
      listener.terminal?.(machine, message.event)
    return
  }
  for (const listener of listeners) listener.event?.(machine, message)
}

function settle(connection: Connection, reply: Reply) {
  const waiter = connection.pending.get(reply.id)
  if (waiter === undefined) return
  connection.pending.delete(reply.id)
  if ('error' in reply) waiter.reject(new Error(reply.error))
  else waiter.resolve(reply.result)
}
