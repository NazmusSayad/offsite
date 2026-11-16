import type { Notice } from '@offsite/core/push'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

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

type PushEvent = {
  data: { json: () => unknown }
  waitUntil: (work: Promise<unknown>) => void
}

const listeners = new Map<string, (event: PushEvent) => void>()
const registration = {
  getNotifications: vi.fn(async () => []),
  showNotification: vi.fn(
    async (_title: string, _options: unknown) => undefined
  ),
}
type Question = { machine: string; sessionId: string }
type FakeWindow = {
  focused: boolean
  postMessage: (question: Question, ports: MessagePort[]) => void
}

let windows: FakeWindow[] = []

function openWindow(focused: boolean, showing: string): FakeWindow {
  return {
    focused,
    postMessage: (question, ports) =>
      ports[0].postMessage(
        question.machine === 'machine' && question.sessionId === showing
      ),
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

async function receivePush(message: Notice) {
  let work: Promise<unknown> = Promise.resolve()
  listeners.get('push')?.({
    data: { json: () => ({ ...message, machineId: 'machine' }) },
    waitUntil: (promise) => {
      work = promise
    },
  })
  await work
}

function shownTitles() {
  return registration.showNotification.mock.calls.map((call) => call[0])
}

beforeAll(async () => {
  vi.spyOn(self, 'addEventListener').mockImplementation((type, listener) => {
    listeners.set(type, listener as unknown as (event: PushEvent) => void)
  })
  vi.stubGlobal('registration', registration)
  vi.stubGlobal('clients', { matchAll: async () => windows })
  vi.stubGlobal('caches', {
    open: async () => ({ match: async () => undefined }),
  })
  const worker = './sw.js'
  await import(worker)
})

beforeEach(() => {
  registration.showNotification.mockClear()
  windows = []
})

describe('receiving a push', () => {
  it('shows the notification when no offsite window is open', async () => {
    await receivePush(notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('stays quiet when a focused window shows that conversation', async () => {
    windows = [openWindow(true, 'session')]

    await receivePush(notice)

    expect(shownTitles()).toEqual([])
  })

  it('shows it when the focused window shows another conversation', async () => {
    windows = [openWindow(true, 'other')]

    await receivePush(notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows it when the window on that conversation is not focused', async () => {
    windows = [openWindow(false, 'session')]

    await receivePush(notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows it when a focused window does not answer', async () => {
    windows = [{ focused: true, postMessage: () => undefined }]

    await receivePush(notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows a notice meant for an open conversation even while it is on screen', async () => {
    windows = [openWindow(true, 'session')]

    await receivePush({ ...notice, whileVisible: true })

    expect(shownTitles()).toEqual(['Fix login'])
  })
})
