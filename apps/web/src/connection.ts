import {
  decodeFrame,
  encodeFrame,
  type Method,
  type Methods,
  type Reply,
  type ServerEvent,
  type ServerMessage,
  type TerminalEvent,
} from '@server/protocol'

type Listener = {
  open?: () => void
  close?: () => void
  event?: (event: ServerEvent) => void
  terminal?: (event: TerminalEvent) => void
  frame?: (frame: ReturnType<typeof decodeFrame>) => void
}

const RECONNECT_DELAY = 1000
const PING_INTERVAL = 30_000
const PING_TIMEOUT = 3000

const listeners = new Set<Listener>()
const pending = new Map<
  number,
  { resolve: (result: unknown) => void; reject: (error: Error) => void }
>()
let socket: WebSocket | null = null
let connected = false
let ping: Promise<boolean> | null = null
let nextId = 0

export function startConnection() {
  return new Promise<void>((resolve) => {
    listen({ open: resolve })
    openSocket()
    window.setInterval(() => void checkConnection(), PING_INTERVAL)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void checkConnection()
    })
  })
}

export function listen(listener: Listener) {
  listeners.add(listener)
}

export function isConnected() {
  return connected
}

export function call<M extends Method>(
  method: M,
  params: Methods[M]['params']
) {
  if (socket === null || !connected)
    return Promise.reject(new Error('Not connected to offsite; reconnecting'))
  nextId += 1
  const id = nextId
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise<Methods[M]['result']>((resolve, reject) =>
    pending.set(id, {
      resolve: (result) => resolve(result as Methods[M]['result']),
      reject,
    })
  )
}

export function sendFrame(kind: number, id: number, data: Uint8Array) {
  if (socket === null || !connected) return
  socket.send(encodeFrame(kind, id, data))
}

export function checkConnection() {
  ping ??= pingServer().finally(() => {
    ping = null
  })
  return ping
}

function openSocket() {
  const next = new WebSocket(
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  )
  next.binaryType = 'arraybuffer'
  next.onopen = () => {
    connected = true
    for (const listener of listeners) listener.open?.()
  }
  next.onmessage = (event) => receive(event.data)
  next.onclose = () => {
    disconnect()
    window.setTimeout(openSocket, RECONNECT_DELAY)
  }
  socket = next
}

function disconnect() {
  for (const waiter of pending.values())
    waiter.reject(new Error('Disconnected from offsite'))
  pending.clear()
  if (!connected) return
  connected = false
  for (const listener of listeners) listener.close?.()
}

async function pingServer() {
  const current = socket
  if (current === null || !connected) return false
  const alive = await Promise.race([
    replied(call('ping', undefined)),
    new Promise<boolean>((resolve) =>
      window.setTimeout(() => resolve(false), PING_TIMEOUT)
    ),
  ])
  if (alive || socket !== current) return alive
  current.onclose = null
  current.close()
  disconnect()
  openSocket()
  return false
}

async function replied(request: Promise<unknown>) {
  try {
    await request
    return true
  } catch {
    return false
  }
}

function receive(data: unknown) {
  if (data instanceof ArrayBuffer) {
    const frame = decodeFrame(new Uint8Array(data))
    for (const listener of listeners) listener.frame?.(frame)
    return
  }
  const message = JSON.parse(String(data)) as ServerMessage
  if (message.type === 'reply') {
    settle(message)
    return
  }
  if (message.type === 'terminal') {
    for (const listener of listeners) listener.terminal?.(message.event)
    return
  }
  for (const listener of listeners) listener.event?.(message)
}

function settle(reply: Reply) {
  const waiter = pending.get(reply.id)
  if (waiter === undefined) return
  pending.delete(reply.id)
  if ('error' in reply) waiter.reject(new Error(reply.error))
  else waiter.resolve(reply.result)
}
