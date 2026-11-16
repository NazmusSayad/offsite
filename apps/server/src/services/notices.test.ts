import { EventEmitter } from 'node:events'
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
const socket = await import('../api/socket.ts')

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

function connectPage(reply: 'here' | 'left' | 'silent') {
  const page = new EventEmitter()
  const replies = new Map<number, () => void>()
  const received: { type: string; notice?: { id: string } }[] = []
  let next = 0
  function request(method: string, params: unknown) {
    next += 1
    const id = next
    const answered = new Promise<void>((resolve) => replies.set(id, resolve))
    page.emit('message', JSON.stringify({ id, method, params }), false)
    return answered
  }
  Object.assign(page, {
    send: (text: string) => {
      const message = JSON.parse(text)
      if (message.type === 'reply') {
        replies.get(message.id)?.()
        return
      }
      received.push(message)
      if (message.type === 'notice.ask' && reply !== 'silent') {
        void request('notices.here', {
          id: message.notice.id,
          here: reply === 'here',
        })
      }
    },
  })
  socket.connectClient(page as never, null, '127.0.0.1')
  return {
    received,
    request,
    close: () => page.emit('close', 1000),
  }
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

  it('keeps waiting for a page that has not answered when another says you left', async () => {
    openPage(now, 'left')
    openPage(now, 'silent')
    subscribeBrowser('https://push.example/phone', 'machine')

    const delivering = notices.notify(input)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fake.sendNotification).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(await delivering).toEqual({ local: true, push: true })
  })

  it('keeps the answers to two notifications apart', async () => {
    const laptop = openPage(now, 'silent')
    subscribeBrowser('https://push.example/phone', 'machine')

    const first = notices.notify(input)
    const second = notices.notify({ ...input, title: 'Fix logout' })
    await vi.advanceTimersByTimeAsync(0)
    const asked = laptop.mock.calls.map((call) => call[0].notice?.id)
    if (asked[1] === undefined) {
      throw new Error('the page was not asked about the second notification')
    }
    notices.receiveAnswer(asked[1], true)

    expect(await second).toEqual({ local: true, push: false })
    expect(fake.sendNotification).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(await first).toEqual({ local: true, push: true })
    expect(pushedTo()).toHaveLength(1)
  })

  it('shortens a long title and body', async () => {
    subscribeBrowser('https://push.example/phone', 'machine')

    await notices.notify({
      ...input,
      title: 'a'.repeat(150),
      body: 'b'.repeat(600),
    })

    const pushed = JSON.parse(fake.sendNotification.mock.calls[0][1])
    expect(pushed.title).toBe(`${'a'.repeat(99)}…`)
    expect(pushed.body).toBe(`${'b'.repeat(499)}…`)
  })

  it('reports no delivery when no page is open and no browser turned on push', async () => {
    expect(await notices.notify(input)).toEqual({ local: false, push: false })
  })
})

describe('pressing a notification button', () => {
  it('runs the action of that button', async () => {
    const run = vi.fn(async () => undefined)
    openPage(0, 'silent')

    await notices.notify({
      ...input,
      buttons: [
        { title: 'Open', kind: 'open' },
        { title: 'Resend', kind: 'run', run },
      ],
    })
    const page = [...hub.clients][0]
    const sent = vi.mocked(page.send).mock.calls[0][0]
    if (sent.type !== 'notice') {
      throw new Error('the page did not get the notification')
    }
    expect(sent.notice.actions).toEqual([
      { id: '0', title: 'Open', kind: 'open' },
      { id: '1', title: 'Resend', kind: 'run' },
    ])
    await notices.act(page, sent.notice.id, '1')

    expect(run).toHaveBeenCalledWith(page)
  })

  it('fails for a button that only opens the conversation', async () => {
    openPage(0, 'silent')

    await notices.notify({
      ...input,
      buttons: [{ title: 'Open', kind: 'open' }],
    })
    const page = [...hub.clients][0]
    const sent = vi.mocked(page.send).mock.calls[0][0]
    if (sent.type !== 'notice') {
      throw new Error('the page did not get the notification')
    }

    await expect(notices.act(page, sent.notice.id, '0')).rejects.toThrow(
      'This notification is no longer available'
    )
  })

  it('forgets the buttons of a notification after a day', async () => {
    const run = vi.fn(async () => undefined)
    openPage(0, 'silent')
    await notices.notify({
      ...input,
      buttons: [{ title: 'Resend', kind: 'run', run }],
    })
    const page = [...hub.clients][0]
    const sent = vi.mocked(page.send).mock.calls[0][0]
    if (sent.type !== 'notice') {
      throw new Error('the page did not get the notification')
    }

    vi.setSystemTime(now + 24 * 60 * 60 * 1000 + 1)
    await notices.notify(input)

    await expect(notices.act(page, sent.notice.id, '0')).rejects.toThrow(
      'This notification is no longer available'
    )
    expect(run).not.toHaveBeenCalled()
  })
})

describe('talking to a page over its connection', () => {
  it('does not push when the page you are using says you are there', async () => {
    const page = connectPage('here')
    subscribeBrowser('https://push.example/phone', 'machine')
    await page.request('notifications.presence', { active: true })

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: true, push: false })
    expect(fake.sendNotification).not.toHaveBeenCalled()
    expect(page.received.map((message) => message.type)).toEqual(['notice.ask'])
    page.close()
  })

  it('pushes right away without asking once the page says you left', async () => {
    const page = connectPage('here')
    subscribeBrowser('https://push.example/phone', 'machine')
    await page.request('notifications.presence', { active: true })
    await page.request('notifications.presence', { active: false })

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: true, push: true })
    expect(page.received.map((message) => message.type)).toEqual(['notice'])
    page.close()
  })

  it('pushes right away when the page asked says you left', async () => {
    const page = connectPage('left')
    subscribeBrowser('https://push.example/phone', 'machine')
    await page.request('notifications.presence', { active: true })

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: true, push: true })
    expect(page.received.map((message) => message.type)).toEqual([
      'notice.ask',
      'notice',
    ])
    page.close()
  })

  it('does not ask a page that has disconnected', async () => {
    const page = connectPage('here')
    subscribeBrowser('https://push.example/phone', 'machine')
    await page.request('notifications.presence', { active: true })
    page.close()

    const delivered = await notices.notify(input)

    expect(delivered).toEqual({ local: false, push: true })
    expect(page.received).toEqual([])
  })
})
