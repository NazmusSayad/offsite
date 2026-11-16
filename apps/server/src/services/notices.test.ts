import { rmSync } from 'node:fs'
import path from 'node:path'
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { Client } from '../lib/hub.ts'

const fake = await vi.hoisted(async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const { join } = await import('node:path')
  const root = fs.realpathSync(
    fs.mkdtempSync(join(os.tmpdir(), 'offsite-notices-'))
  )
  return { root, sendNotification: vi.fn() }
})

vi.mock('../args.ts', () => ({
  args: { dir: fake.root },
  serverDir: path.join(import.meta.dirname, '..', '..'),
  version: 'test',
}))
vi.mock('web-push', () => ({
  default: { sendNotification: fake.sendNotification },
}))

const storage = await import('../storage/db.ts')
const schema = await import('../storage/schema.ts')
const hub = await import('../lib/hub.ts')
const push = await import('./push.ts')
const notices = await import('./notices.ts')

const input = {
  title: 'Fix login',
  body: 'Fixed the login page',
  summary: 'Fixed the login page',
  source: 'claude' as const,
  state: 'done' as const,
  image: null,
  whileVisible: false,
  session: { sessionId: 'session', projectId: 'project', worktreeId: null },
  buttons: [],
}

function subscribeBrowser(endpoint: string, machine: string) {
  push.subscribe({
    subscription: { endpoint, keys: { p256dh: 'p256dh', auth: 'auth' } },
    publicKey: 'public',
    privateKey: 'private',
    machine,
  })
}

function openPage(activeAt: number, reply: 'here' | 'left' | 'silent') {
  const send = vi.fn((message: { type: string; notice?: { id: string } }) => {
    if (message.type !== 'notice.ask' || message.notice === undefined) {
      return
    }
    if (reply === 'here') {
      notices.receiveAnswer(message.notice.id, true)
    }
    if (reply === 'left') {
      notices.receiveAnswer(message.notice.id, false)
    }
  })
  hub.clients.add({
    socket: {} as Client['socket'],
    device: null,
    address: '127.0.0.1',
    activeAt,
    opening: null,
    sessionId: null,
    send,
  })
  return send
}

function pushedTo() {
  return fake.sendNotification.mock.calls.map((call) => ({
    endpoint: call[0].endpoint,
    machineId: JSON.parse(call[1]).machineId,
  }))
}

function savedEndpoints() {
  return storage.db
    .select()
    .from(schema.pushSubscriptions)
    .all()
    .map((row) => row.endpoint)
    .sort()
}

const now = Date.UTC(2026, 0, 1)

push.startPush('127.0.0.1:4000')

beforeEach(() => {
  storage.db.delete(schema.pushSubscriptions).run()
  hub.clients.clear()
  fake.sendNotification.mockReset()
  fake.sendNotification.mockResolvedValue({ statusCode: 201 })
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  vi.setSystemTime(now)
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(() => {
  rmSync(fake.root, { recursive: true, force: true })
})

describe('sending a notification', () => {
  it('pushes it to every browser that turned on push', async () => {
    subscribeBrowser('https://push.example/phone', 'machine-on-phone')
    subscribeBrowser('https://push.example/laptop', 'machine-on-laptop')

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: false, push: true })
    expect(pushedTo()).toEqual(
      expect.arrayContaining([
        {
          endpoint: 'https://push.example/phone',
          machineId: 'machine-on-phone',
        },
        {
          endpoint: 'https://push.example/laptop',
          machineId: 'machine-on-laptop',
        },
      ])
    )
    expect(pushedTo()).toHaveLength(2)
  })

  it('does not push to browsers that subscribed through another server', async () => {
    storage.db
      .insert(schema.pushSubscriptions)
      .values({
        endpoint: 'https://push.example/other',
        p256dh: 'p256dh',
        auth: 'auth',
        publicKey: 'public',
        privateKey: 'private',
        machine: 'machine',
        server: '127.0.0.1:5000',
      })
      .run()

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: false, push: false })
    expect(fake.sendNotification).not.toHaveBeenCalled()
  })

  it('sends it to every open page and pushes when nobody is using a page', async () => {
    const send = openPage(0, 'silent')
    subscribeBrowser('https://push.example/phone', 'machine')

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: true, push: true })
    expect(send).toHaveBeenCalledWith({
      type: 'notice',
      notice: expect.objectContaining({
        title: 'Fix login',
        target: {
          sessionId: 'session',
          projectId: 'project',
          worktreeId: null,
        },
      }),
      pushed: true,
    })
  })

  it('asks only the pages used in the last 15 seconds whether you are still there', async () => {
    const used = openPage(now - 14_999, 'here')
    const idle = openPage(now - 15_000, 'silent')

    await notices.notify(input)

    expect(used).toHaveBeenCalledWith({
      type: 'notice.ask',
      notice: expect.objectContaining({ title: 'Fix login' }),
    })
    expect(idle).not.toHaveBeenCalled()
  })

  it('does not push when the page you are using says you are there', async () => {
    openPage(now, 'here')
    subscribeBrowser('https://push.example/phone', 'machine')

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: true, push: false })
    expect(fake.sendNotification).not.toHaveBeenCalled()
  })

  it('does not wait for a sleeping laptop when your phone says you are there', async () => {
    openPage(now, 'silent')
    openPage(now, 'here')
    subscribeBrowser('https://push.example/phone', 'machine')

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: true, push: false })
  })

  it('pushes to every device right away when every page asked says you left', async () => {
    const laptop = openPage(now, 'left')
    openPage(now, 'left')
    subscribeBrowser('https://push.example/phone', 'machine')
    subscribeBrowser('https://push.example/laptop', 'machine')

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: true, push: true })
    expect(pushedTo()).toHaveLength(2)
    expect(laptop).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'notice', pushed: true })
    )
  })

  it('pushes to every device when the page asked does not answer in 2 seconds', async () => {
    openPage(now, 'silent')
    subscribeBrowser('https://push.example/phone', 'machine')

    const delivering = notices.notify(input)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fake.sendNotification).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(await delivering).toEqual({ local: true, push: true })
    expect(pushedTo()).toHaveLength(1)
  })

  it('ignores an answer that comes after it gave up waiting', async () => {
    const laptop = openPage(now, 'silent')
    subscribeBrowser('https://push.example/phone', 'machine')

    const delivering = notices.notify(input)
    await vi.advanceTimersByTimeAsync(2000)
    await delivering
    const asked = laptop.mock.calls[0][0].notice
    if (asked === undefined) {
      throw new Error('the page was not asked')
    }
    notices.receiveAnswer(asked.id, true)

    expect(pushedTo()).toHaveLength(1)
  })

  it('pushes once the page has not been used for 15 seconds', async () => {
    const send = openPage(now - 15_000, 'silent')
    subscribeBrowser('https://push.example/phone', 'machine')

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: true, push: true })
    expect(pushedTo()).toHaveLength(1)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'notice', pushed: true })
    )
  })

  it('forgets a browser whose push address is gone and keeps the others', async () => {
    subscribeBrowser('https://push.example/gone', 'machine')
    subscribeBrowser('https://push.example/phone', 'machine')
    fake.sendNotification.mockImplementation(
      async (subscription: { endpoint: string }) => {
        if (subscription.endpoint === 'https://push.example/gone') {
          throw Object.assign(new Error('gone'), { statusCode: 410 })
        }
        return { statusCode: 201 }
      }
    )

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: false, push: true })
    expect(savedEndpoints()).toEqual(['https://push.example/phone'])
  })

  it('reports no delivery when no page is open and no browser turned on push', async () => {
    expect(await notices.notify(input)).toEqual({ local: false, push: false })
  })
})
