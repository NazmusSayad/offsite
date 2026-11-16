import type { Notice } from '@offsite/core/push'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  search: {} as { machine?: string; session?: string },
  location: { pathname: '/' },
}))

vi.mock('@/api/connection', () => ({
  call: vi.fn(),
  isConnected: vi.fn(),
  machineUrl: () => 'https://of.example',
}))
vi.mock('@/api/machines', () => ({ machineKey: vi.fn() }))
vi.mock('@/lib/log', () => ({
  logger: { withTag: () => ({ error: vi.fn(), info: vi.fn() }) },
}))
vi.mock('./store', () => ({
  activityOf: vi.fn(),
  getState: vi.fn(),
  threadState: vi.fn(),
  useStore: vi.fn(),
}))
vi.mock('./router', () => ({
  router: { history: { location: fake.location } },
}))
vi.mock('./url', () => ({ currentSearch: () => fake.search }))

const notifications = await import('./notifications')

const registration = {
  getNotifications: vi.fn(async (): Promise<{ data: unknown }[]> => []),
  showNotification: vi.fn(
    async (_title: string, _options: { data: unknown }) => undefined
  ),
  pushManager: {
    getSubscription: vi.fn(async (): Promise<object | null> => null),
  },
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

function shownTitles() {
  return registration.showNotification.mock.calls.map((call) => call[0])
}

beforeAll(() => {
  Object.defineProperty(window, 'isSecureContext', {
    value: true,
    configurable: true,
  })
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve(registration) },
    configurable: true,
  })
  let held: Promise<unknown> = Promise.resolve()
  Object.defineProperty(navigator, 'locks', {
    value: {
      request: (_name: string, work: () => Promise<unknown>) => {
        const run = held.then(work)
        held = run.catch(() => undefined)
        return run
      },
    },
    configurable: true,
  })
  vi.stubGlobal('Notification', { permission: 'granted' })
  vi.stubGlobal('PushManager', class {})
})

beforeEach(() => {
  registration.showNotification.mockReset()
  registration.getNotifications.mockReset()
  registration.getNotifications.mockResolvedValue([])
  registration.pushManager.getSubscription.mockResolvedValue(null)
  localStorage.clear()
  fake.search = {}
  fake.location.pathname = '/'
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
})

describe('showing a notification from an open page', () => {
  it('shows it when push is off on this device', async () => {
    await notifications.showNoticeHere('machine', notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('leaves it to the push when push is on, so it does not show twice', async () => {
    registration.pushManager.getSubscription.mockResolvedValue({})

    await notifications.showNoticeHere('machine', notice)

    expect(shownTitles()).toEqual([])
  })

  it('stays quiet while you look at that conversation', async () => {
    fake.search = { machine: 'machine', session: 'session' }

    await notifications.showNoticeHere('machine', notice)

    expect(shownTitles()).toEqual([])
  })

  it('shows it while you look at another conversation', async () => {
    fake.search = { machine: 'machine', session: 'other' }

    await notifications.showNoticeHere('machine', notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows it while you are on another page with that conversation in the address', async () => {
    fake.search = { machine: 'machine', session: 'session' }
    fake.location.pathname = '/activity'

    await notifications.showNoticeHere('machine', notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('tells the push handler you are looking at that conversation', () => {
    fake.search = { machine: 'machine', session: 'session' }

    expect(notifications.watching('machine', 'session')).toBe(true)
    expect(notifications.watching('machine', 'other')).toBe(false)
  })

  it('shows it when the conversation is open but the window is not focused', async () => {
    fake.search = { machine: 'machine', session: 'session' }
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    await notifications.showNoticeHere('machine', notice)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows it only once when another tab already showed it', async () => {
    registration.getNotifications.mockResolvedValue([
      { data: { machine: 'machine', notice, digest: [] } },
    ])

    await notifications.showNoticeHere('machine', notice)

    expect(shownTitles()).toEqual([])
  })

  it('shows it once when two tabs get it at the same time', async () => {
    const shown: { data: unknown }[] = []
    registration.getNotifications.mockImplementation(async () => shown)
    registration.showNotification.mockImplementation(
      async (_title: string, options: { data: unknown }) => {
        shown.push({ data: options.data })
      }
    )

    await Promise.all([
      notifications.showNoticeHere('machine', notice),
      notifications.showNoticeHere('machine', notice),
    ])

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('stays quiet when notifications are turned off in settings', async () => {
    localStorage.setItem('notifications', 'off')

    await notifications.showNoticeHere('machine', notice)

    expect(shownTitles()).toEqual([])
  })
})
