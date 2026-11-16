import type { Notice } from '@offsite/core/push'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { readToken } from './lib/tokens'

vi.mock('workbox-core', () => ({ clientsClaim: vi.fn() }))
vi.mock('workbox-precaching', () => ({
  cleanupOutdatedCaches: vi.fn(),
  createHandlerBoundToURL: vi.fn(),
  precacheAndRoute: vi.fn(),
}))
vi.mock('workbox-routing', () => ({
  NavigationRoute: vi.fn(),
  registerRoute: vi.fn(),
}))
vi.mock('./lib/tokens', () => ({ readToken: vi.fn() }))

type WorkerEvent = {
  waitUntil: (work: Promise<unknown>) => void
  [key: string]: unknown
}

const listeners = new Map<string, (event: WorkerEvent) => void>()
const registration = {
  getNotifications: vi.fn(async () => []),
  showNotification: vi.fn(
    async (_title: string, _options: { image?: string }) => undefined
  ),
}
type Question = { machine: string; sessionId: string }
type FakeWindow = {
  focused: boolean
  postMessage: (question: unknown, ports?: MessagePort[]) => void
  focus: () => Promise<void>
}

let windows: FakeWindow[] = []
let machines: { id: string; addresses: string[] }[] = []
const openWindow = vi.fn(async (_url: string) => null)

function fakeWindow(focused: boolean, showing: string): FakeWindow {
  return {
    focused,
    postMessage: (question, ports) =>
      ports?.[0].postMessage(
        (question as Question).machine === 'machine' &&
          (question as Question).sessionId === showing
      ),
    focus: vi.fn(async () => undefined),
  }
}

const notice: Notice = {
  id: 'notice',
  tag: 'session:session',
  title: 'Fix login',
  body: 'Fixed the login page',
  summary: 'Fixed the login page',
  source: 'claude',
  state: 'done',
  image: null,
  actions: [],
  whileVisible: false,
  target: { projectId: 'project', worktreeId: null, sessionId: 'session' },
}

async function dispatch(type: string, event: Record<string, unknown>) {
  let work: Promise<unknown> = Promise.resolve()
  listeners.get(type)?.({
    ...event,
    waitUntil: (promise) => {
      work = promise
    },
  })
  await work
}

function receivePush(message: Notice | null) {
  return dispatch('push', {
    data:
      message === null
        ? null
        : { json: () => ({ ...message, machineId: 'machine' }) },
  })
}

function click(data: unknown, action = '') {
  return dispatch('notificationclick', {
    notification: { close: vi.fn(), data },
    action,
  })
}

function shownTitles() {
  return registration.showNotification.mock.calls.map((call) => call[0])
}

beforeAll(async () => {
  vi.spyOn(self, 'addEventListener').mockImplementation((type, listener) => {
    listeners.set(type, listener as unknown as (event: WorkerEvent) => void)
  })
  vi.stubGlobal('registration', registration)
  vi.stubGlobal('clients', {
    matchAll: async () => windows,
    openWindow,
  })
  vi.stubGlobal('caches', {
    open: async () => ({
      match: async (path: string) =>
        path === '/machines'
          ? new Response(JSON.stringify(machines))
          : undefined,
    }),
  })
  const worker = './sw.js'
  await import(worker)
})

beforeEach(() => {
  registration.showNotification.mockClear()
  openWindow.mockClear()
  windows = []
  machines = []
})

afterEach(() => {
  vi.useRealTimers()
})

describe('receiving a push', () => {
  it('shows the notification when no offsite window is open', async () => {
    await receivePush(notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('stays quiet when a focused window shows that conversation', async () => {
    windows = [fakeWindow(true, 'session')]

    await receivePush(notice)

    expect(shownTitles()).toEqual([])
  })

  it('stays quiet when one of several focused windows shows that conversation', async () => {
    windows = [fakeWindow(true, 'other'), fakeWindow(true, 'session')]

    await receivePush(notice)

    expect(shownTitles()).toEqual([])
  })

  it('shows it when the focused window shows another conversation', async () => {
    windows = [fakeWindow(true, 'other')]

    await receivePush(notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows it when the window on that conversation is not focused', async () => {
    windows = [fakeWindow(false, 'session')]

    await receivePush(notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows it after 1 second when a focused window does not answer', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    windows = [{ ...fakeWindow(true, 'session'), postMessage: () => undefined }]

    const receiving = receivePush(notice)
    await vi.advanceTimersByTimeAsync(999)
    expect(shownTitles()).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    await receiving

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows a notice meant for an open conversation even while it is on screen', async () => {
    windows = [fakeWindow(true, 'session')]

    await receivePush({ ...notice, whileVisible: true })

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('loads the image from the machine that sent it', async () => {
    machines = [{ id: 'machine', addresses: ['https://of.example'] }]

    await receivePush({ ...notice, image: '/api/notice-image/picture' })

    expect(registration.showNotification.mock.calls[0][1].image).toBe(
      'https://of.example/api/notice-image/picture'
    )
  })

  it('shows a plain notification when the push has no message', async () => {
    await receivePush(null)

    expect(shownTitles()).toEqual(['OffSite'])
  })
})

describe('clicking a notification', () => {
  const data = { machine: 'machine', notice, digest: [] }

  it('opens the conversation in the window that is already open', async () => {
    const open = fakeWindow(false, 'other')
    const postMessage = vi.spyOn(open, 'postMessage')
    windows = [open]

    await click(data)

    expect(postMessage).toHaveBeenCalledWith({
      type: 'openSession',
      machine: 'machine',
      project: 'project',
      worktree: null,
      sessionId: 'session',
      panel: null,
    })
    expect(open.focus).toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opens a new window on the conversation when none is open', async () => {
    await click(data)

    expect(openWindow).toHaveBeenCalledWith(
      '/?machine=machine&project=project&session=session'
    )
  })

  it('opens the changes when you press the diff button', async () => {
    await click(
      {
        ...data,
        notice: {
          ...notice,
          actions: [{ id: '0', title: 'Diff', kind: 'diff' }],
        },
      },
      '0'
    )

    expect(openWindow).toHaveBeenCalledWith(
      '/?machine=machine&project=project&session=session&panel=diff'
    )
  })

  it('opens the conversation when a button action could not run', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await click(
      {
        ...data,
        notice: {
          ...notice,
          actions: [{ id: '0', title: 'Resend', kind: 'run' }],
        },
      },
      '0'
    )

    expect(openWindow).toHaveBeenCalledWith(
      '/?machine=machine&project=project&session=session'
    )
  })

  it('runs a button action on the machine after logging in with its key', async () => {
    machines = [
      {
        id: 'machine',
        addresses: ['http://127.0.0.1:1', 'https://of.example'],
      },
    ]
    vi.mocked(readToken).mockResolvedValue('machine-key')
    const original = globalThis.WebSocket
    const sent: Record<string, string[]> = {}
    const closed: string[] = []
    vi.stubGlobal(
      'WebSocket',
      class {
        onopen: (() => void) | null = null
        onmessage: ((event: { data: string }) => void) | null = null
        onclose: ((event: { reason: string }) => void) | null = null
        url: string

        constructor(url: string) {
          this.url = url
          sent[url] = []
          queueMicrotask(() => {
            if (url.startsWith('ws://127.0.0.1:1')) {
              this.onclose?.({ reason: '' })
              return
            }
            this.onopen?.()
          })
        }

        send(text: string) {
          sent[this.url].push(text)
          const message = JSON.parse(text)
          const reply =
            'method' in message
              ? { type: 'reply', id: message.id, result: null }
              : { type: 'welcome', snapshot: {} }
          queueMicrotask(() =>
            this.onmessage?.({ data: JSON.stringify(reply) })
          )
        }

        close() {
          closed.push(this.url)
        }
      }
    )

    await click(
      {
        ...data,
        notice: {
          ...notice,
          actions: [{ id: '0', title: 'Resend', kind: 'run' }],
        },
      },
      '0'
    )

    expect(sent['wss://of.example/ws']).toEqual([
      JSON.stringify({ key: 'machine-key' }),
      JSON.stringify({
        id: 1,
        method: 'notices.act',
        params: { id: 'notice', action: '0' },
      }),
    ])
    expect(closed).toEqual(['wss://of.example/ws'])
    expect(openWindow).not.toHaveBeenCalled()
    vi.stubGlobal('WebSocket', original)
  })

  it('opens offsite when the notification has no conversation', async () => {
    await click(null)

    expect(openWindow).toHaveBeenCalledWith('/')
  })
})
