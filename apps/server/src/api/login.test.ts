import { EventEmitter, once } from 'node:events'
import { rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { NEEDS_PAIRING } from '@offsite/core/protocol'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
import type { Client } from '../lib/hub.ts'

const fake = await vi.hoisted(async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const { join } = await import('node:path')
  const root = fs.realpathSync(
    fs.mkdtempSync(join(os.tmpdir(), 'offsite-login-'))
  )
  return {
    root,
    args: { dir: root, service: false, serverArguments: [], auth: true },
  }
})

vi.mock('../args.ts', () => ({
  args: fake.args,
  serverDir: path.join(import.meta.dirname, '..', '..'),
  version: 'test',
}))

const auth = await import('../storage/auth.ts')
const hub = await import('../lib/hub.ts')
const login = await import('./login.ts')

let server: WebSocketServer
let address: string

beforeAll(async () => {
  server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  server.on('connection', (socket) => login.logIn(socket, '127.0.0.1'))
  await once(server, 'listening')
  address = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
  rmSync(fake.root, { recursive: true, force: true })
})

beforeEach(() => {
  fake.args.auth = true
})

afterEach(() => {
  vi.useRealTimers()
  hub.clients.clear()
})

async function logInWith(first: string | Buffer) {
  const socket = new WebSocket(address)
  await once(socket, 'open')
  socket.send(first)
  return await new Promise<{ welcomed: boolean; code: number | null }>(
    (resolve) => {
      socket.on('message', (data) => {
        if (JSON.parse(String(data)).type === 'welcome') {
          socket.close()
          resolve({ welcomed: true, code: null })
        }
      })
      socket.on('close', (code) => resolve({ welcomed: false, code }))
    }
  )
}

function pairBrowser(name: string) {
  const token = auth.redeemCode(auth.addCode(name))
  if (token === null) {
    throw new Error('the pairing code did not work')
  }
  return token
}

describe('logging in on the live connection', () => {
  it('lets any browser in when pairing is off', async () => {
    fake.args.auth = false

    expect(await logInWith('{}')).toEqual({ welcomed: true, code: null })
    expect(await logInWith(JSON.stringify({ key: 'unknown' }))).toEqual({
      welcomed: true,
      code: null,
    })
  })

  it('lets a paired browser in with its key and records when it was used', async () => {
    const token = pairBrowser('phone')

    expect(await logInWith(JSON.stringify({ key: token }))).toEqual({
      welcomed: true,
      code: null,
    })
    const phone = auth.readDevices().find((item) => item.name === 'phone')
    expect(phone?.lastUsedAt).not.toBe(null)
  })

  it('turns away a browser without a known key when pairing is on', async () => {
    expect(await logInWith('{}')).toEqual({
      welcomed: false,
      code: NEEDS_PAIRING,
    })
    expect(await logInWith(JSON.stringify({ key: 'unknown' }))).toEqual({
      welcomed: false,
      code: NEEDS_PAIRING,
    })
  })

  it('turns away a browser whose key was unpaired', async () => {
    const token = pairBrowser('laptop')
    const device = auth.findDevice(token)
    if (device === null) {
      throw new Error('the browser was not paired')
    }
    auth.removeDevices([device])

    expect(await logInWith(JSON.stringify({ key: token }))).toEqual({
      welcomed: false,
      code: NEEDS_PAIRING,
    })
  })

  it.each([
    ['text that is not JSON', 'hello'],
    ['a key that is not text', JSON.stringify({ key: 1 })],
    ['extra fields', JSON.stringify({ key: 'unknown', extra: true })],
    ['a binary message', Buffer.from('{}')],
  ])('closes a connection that starts with %s', async (_, first) => {
    fake.args.auth = false

    const result = await logInWith(first)

    expect(result.welcomed).toBe(false)
    expect(result.code).not.toBe(NEEDS_PAIRING)
  })

  it('closes a connection that says nothing for 5 seconds', () => {
    vi.useFakeTimers()
    const socket = Object.assign(new EventEmitter(), { close: vi.fn() })

    login.logIn(socket as never, '127.0.0.1')
    vi.advanceTimersByTime(4999)
    expect(socket.close).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(socket.close).toHaveBeenCalled()
  })
})

describe('watching for unpaired browsers', () => {
  it('disconnects a browser within 5 seconds of unpairing it', () => {
    vi.useFakeTimers()
    const device = auth.findDevice(pairBrowser('tablet'))
    if (device === null) {
      throw new Error('the browser was not paired')
    }
    const close = vi.fn()
    hub.clients.add({
      socket: { close } as unknown as Client['socket'],
      device,
      address: '127.0.0.1',
      activeAt: 0,
      opening: null,
      sessionId: null,
      send: vi.fn(),
    })

    login.watchPaired()
    vi.advanceTimersByTime(5000)
    expect(close).not.toHaveBeenCalled()
    auth.removeDevices([device])
    vi.advanceTimersByTime(5000)

    expect(close).toHaveBeenCalled()
  })
})
