import { NEEDS_PAIRING } from '@offsite/core/protocol'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  call,
  connectMachine,
  disconnectMachine,
  isConnected,
  listen,
  machineUrl,
  startConnections,
} from './connection'

const tokens = vi.hoisted(() => new Map<string, string>())

vi.mock('@/lib/tokens', () => ({
  readToken: async (machine: string) => tokens.get(machine),
}))

class FakeSocket {
  static all: FakeSocket[] = []
  url: string
  binaryType = ''
  sent: string[] = []
  closed = false
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeSocket.all.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.end(1005)
  }

  end(code: number) {
    if (this.closed) {
      return
    }
    this.closed = true
    queueMicrotask(() => this.onclose?.({ code }))
  }

  open() {
    this.onopen?.()
  }

  receive(message: object) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

const opened = vi.fn()
const closed = vi.fn()
const unpaired = vi.fn()
const events = vi.fn()
listen({ open: opened, close: closed, unpaired, event: events })

const snapshot = { hostname: 'windows' }
let machine = 0
let current = ''

function socketsFor(url: string) {
  return FakeSocket.all.filter((socket) => socket.url === url)
}

function latest(url: string) {
  const sockets = socketsFor(url)
  return sockets[sockets.length - 1]
}

async function connect(urls: string[]) {
  connectMachine(current, urls)
  await vi.advanceTimersByTimeAsync(0)
}

async function welcome(socket: FakeSocket) {
  socket.open()
  socket.receive({ type: 'welcome', snapshot })
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', FakeSocket)
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  FakeSocket.all = []
  tokens.clear()
  opened.mockClear()
  closed.mockClear()
  unpaired.mockClear()
  events.mockClear()
  machine += 1
  current = `machine-${machine}`
  startConnections()
})

afterEach(() => {
  disconnectMachine(current)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('logging in', () => {
  it('sends the saved key as the first message', async () => {
    tokens.set(current, 'windows-key')
    await connect(['http://windows.local:2020'])
    const socket = latest('ws://windows.local:2020/ws')

    socket.open()

    expect(socket.sent).toEqual([JSON.stringify({ key: 'windows-key' })])
  })

  it('sends an empty login when no key is saved', async () => {
    await connect(['https://mac.example'])
    const socket = latest('wss://mac.example/ws')

    socket.open()

    expect(socket.sent).toEqual(['{}'])
  })

  it('counts as connected only once the machine welcomes it', async () => {
    await connect(['http://windows.local:2020'])
    const socket = latest('ws://windows.local:2020/ws')

    socket.open()
    socket.receive({ type: 'activity', activity: {} })
    expect(isConnected(current)).toBe(false)
    expect(events).not.toHaveBeenCalled()
    socket.receive({ type: 'welcome', snapshot })

    expect(isConnected(current)).toBe(true)
    expect(opened).toHaveBeenCalledWith(
      current,
      'http://windows.local:2020',
      snapshot
    )
    socket.receive({ type: 'activity', activity: {} })
    expect(events).toHaveBeenCalledWith(current, {
      type: 'activity',
      activity: {},
    })
  })

  it('reports an unpaired browser when every address refuses the key', async () => {
    await connect(['http://windows.local:2020', 'https://windows.example'])

    latest('ws://windows.local:2020/ws').end(NEEDS_PAIRING)
    latest('wss://windows.example/ws').end(1006)
    await vi.advanceTimersByTimeAsync(0)

    expect(unpaired).toHaveBeenCalledWith(current)
    expect(closed).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(FakeSocket.all).toHaveLength(2)
  })
})

describe('several addresses', () => {
  it('tries every address at once and keeps the first one that answers', async () => {
    await connect(['http://windows.local:2020', 'https://windows.example'])
    const local = latest('ws://windows.local:2020/ws')
    const remote = latest('wss://windows.example/ws')

    await welcome(remote)

    expect(local.closed).toBe(true)
    expect(remote.closed).toBe(false)
    expect(machineUrl(current)).toBe('https://windows.example')
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('closes a slower address that answers after another one won', async () => {
    await connect(['http://windows.local:2020', 'https://windows.example'])
    const local = latest('ws://windows.local:2020/ws')
    const remote = latest('wss://windows.example/ws')
    local.open()
    remote.open()

    remote.receive({ type: 'welcome', snapshot })
    local.receive({ type: 'welcome', snapshot })

    expect(machineUrl(current)).toBe('https://windows.example')
    expect(local.closed).toBe(true)
    expect(opened).toHaveBeenCalledTimes(1)
  })

  it('gives up on an address that does not open within 3 seconds', async () => {
    await connect(['http://windows.local:2020'])
    const socket = latest('ws://windows.local:2020/ws')

    await vi.advanceTimersByTimeAsync(2999)
    expect(socket.closed).toBe(false)
    await vi.advanceTimersByTimeAsync(1)

    expect(socket.closed).toBe(true)
    expect(closed).toHaveBeenCalledWith(current)
  })
})

describe('reconnecting', () => {
  it('tries again after a second when no address answers', async () => {
    await connect(['http://windows.local:2020'])

    latest('ws://windows.local:2020/ws').end(1006)
    await vi.advanceTimersByTimeAsync(0)
    expect(closed).toHaveBeenCalledWith(current)
    await vi.advanceTimersByTimeAsync(999)
    expect(socketsFor('ws://windows.local:2020/ws')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)

    expect(socketsFor('ws://windows.local:2020/ws')).toHaveLength(2)
  })

  it('reconnects when a live connection closes', async () => {
    await connect(['http://windows.local:2020'])
    await welcome(latest('ws://windows.local:2020/ws'))
    const failed = expect(
      call(current, 'config.get', undefined)
    ).rejects.toThrow('Disconnected from windows.local')

    latest('ws://windows.local:2020/ws').end(1006)
    await vi.advanceTimersByTimeAsync(0)

    await failed
    expect(isConnected(current)).toBe(false)
    expect(closed).toHaveBeenCalledWith(current)
    await vi.advanceTimersByTimeAsync(1000)
    expect(socketsFor('ws://windows.local:2020/ws')).toHaveLength(2)
  })

  it('reconnects when a connected machine goes quiet for 10 seconds', async () => {
    await connect(['http://windows.local:2020'])
    const first = latest('ws://windows.local:2020/ws')
    await welcome(first)

    await vi.advanceTimersByTimeAsync(9000)
    expect(first.closed).toBe(false)
    await vi.advanceTimersByTimeAsync(3000)

    expect(first.closed).toBe(true)
    expect(closed).toHaveBeenCalledWith(current)
    expect(socketsFor('ws://windows.local:2020/ws')).toHaveLength(2)
  })

  it('stays connected while the machine keeps sending alive messages', async () => {
    await connect(['http://windows.local:2020'])
    const socket = latest('ws://windows.local:2020/ws')
    await welcome(socket)

    for (let second = 0; second < 30; second += 5) {
      await vi.advanceTimersByTimeAsync(5000)
      socket.receive({ type: 'alive' })
    }

    expect(socket.closed).toBe(false)
    expect(isConnected(current)).toBe(true)
    expect(FakeSocket.all).toHaveLength(1)
  })

  it('stops for good when the machine is removed', async () => {
    await connect(['http://windows.local:2020'])
    const socket = latest('ws://windows.local:2020/ws')
    await welcome(socket)

    disconnectMachine(current)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(socket.closed).toBe(true)
    expect(FakeSocket.all).toHaveLength(1)
  })
})
