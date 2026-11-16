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

const fake = vi.hoisted(() => ({
  search: {} as { machine?: string; session?: string },
  location: { pathname: '/' },
  selection: {} as object | null,
  wide: { matches: false },
  machines: ['machine'],
  connected: ['machine'],
  notification: { permission: 'granted' },
  logError: vi.fn(),
}))

vi.mock('@/api/connection', () => ({
  call: vi.fn(async () => null),
  isConnected: (machine: string) => fake.connected.includes(machine),
  machineUrl: () => 'https://of.example',
}))
vi.mock('@/api/machines', () => ({ machineKey: vi.fn() }))
vi.mock('@/lib/log', () => ({
  logger: { withTag: () => ({ error: fake.logError, info: vi.fn() }) },
}))
vi.mock('./store', () => ({
  activityOf: vi.fn(),
  getState: () => ({
    machines: fake.machines.map((id) => ({ id })),
    selection: fake.selection,
  }),
  threadState: vi.fn(),
  useStore: vi.fn(),
}))
vi.mock('./router', () => ({
  router: { history: { location: fake.location } },
}))
vi.mock('./url', () => ({ currentSearch: () => fake.search }))
vi.mock('./utils', () => ({ wide: fake.wide }))

const connection = await import('@/api/connection')
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

function presenceSent() {
  return vi.mocked(connection.call).mock.calls
}

function fire(type: string) {
  window.dispatchEvent(new Event(type))
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
  vi.stubGlobal('Notification', fake.notification)
  vi.stubGlobal('PushManager', class {})
  notifications.startPresence()
})

beforeEach(() => {
  registration.showNotification.mockReset()
  registration.getNotifications.mockReset()
  registration.getNotifications.mockResolvedValue([])
  registration.pushManager.getSubscription.mockResolvedValue(null)
  localStorage.clear()
  fake.search = {}
  fake.location.pathname = '/'
  fake.selection = {}
  fake.wide.matches = false
  fake.machines = ['machine']
  fake.connected = ['machine']
  fake.notification.permission = 'granted'
  fake.logError.mockClear()
  vi.mocked(connection.call).mockReset()
  vi.mocked(connection.call).mockResolvedValue(null)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})

describe('showing a notification from an open page', () => {
  it('shows it when push is off on this device', async () => {
    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('leaves it to the push when push is on, so it does not show twice', async () => {
    registration.pushManager.getSubscription.mockResolvedValue({})

    await notifications.showNoticeHere('machine', notice, true)

    expect(shownTitles()).toEqual([])
  })

  it('shows it when push is on but the server did not push it', async () => {
    registration.pushManager.getSubscription.mockResolvedValue({})

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('stays quiet while you look at that conversation', async () => {
    fake.search = { machine: 'machine', session: 'session' }

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual([])
  })

  it('shows it while you look at another conversation', async () => {
    fake.search = { machine: 'machine', session: 'other' }

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows it while you are on another page with that conversation in the address', async () => {
    fake.search = { machine: 'machine', session: 'session' }
    fake.location.pathname = '/activity'

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('stays quiet on a desktop window you are using, since the sidebar shows it', async () => {
    fake.wide.matches = true
    fake.search = { machine: 'machine', session: 'other' }

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual([])
  })

  it('shows it on desktop when the window is not focused', async () => {
    fake.wide.matches = true
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows a notice that asks for you even on a desktop window you are using', async () => {
    fake.wide.matches = true

    await notifications.showNoticeHere(
      'machine',
      { ...notice, whileVisible: true },
      false
    )

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('stays quiet on a phone while the conversation list is open', async () => {
    fake.selection = null

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual([])
  })

  it('shows it on a phone when the page is hidden', async () => {
    fake.search = { machine: 'machine', session: 'session' }
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('tells the push handler when this page already shows that conversation', () => {
    fake.search = { machine: 'machine', session: 'session' }

    expect(notifications.watching('machine', 'session')).toBe(true)
    expect(notifications.watching('machine', 'other')).toBe(false)

    fake.selection = null
    expect(notifications.watching('machine', 'other')).toBe(true)

    fake.selection = {}
    fake.wide.matches = true
    expect(notifications.watching('machine', 'other')).toBe(true)

    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    expect(notifications.watching('machine', 'other')).toBe(false)
  })

  it('shows it when the conversation is open but the window is not focused', async () => {
    fake.search = { machine: 'machine', session: 'session' }
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('shows it only once when another tab already showed it', async () => {
    registration.getNotifications.mockResolvedValue([
      { data: { machine: 'machine', notice, digest: [] } },
    ])

    await notifications.showNoticeHere('machine', notice, false)

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
      notifications.showNoticeHere('machine', notice, false),
      notifications.showNoticeHere('machine', notice, false),
    ])

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('stays quiet when this browser has not allowed notifications', async () => {
    fake.notification.permission = 'denied'

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual([])
  })

  it('shows a notice that asks for you even while that conversation is on screen', async () => {
    fake.search = { machine: 'machine', session: 'session' }

    await notifications.showNoticeHere(
      'machine',
      { ...notice, whileVisible: true },
      false
    )

    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('stays quiet when notifications are turned off in settings', async () => {
    localStorage.setItem('notifications', 'off')

    await notifications.showNoticeHere('machine', notice, false)

    expect(shownTitles()).toEqual([])
  })
})

describe('telling the servers whether you are using this page', () => {
  let now = Date.UTC(2026, 0, 1)

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    now += 60_000
    vi.setSystemTime(now)
    fire('blur')
    vi.mocked(connection.call).mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says you are using it when you click, type or scroll', () => {
    fire('pointerdown')

    expect(presenceSent()).toEqual([
      ['machine', 'notifications.presence', { active: true }],
    ])
  })

  it('counts coming back to the window as using it', () => {
    fire('focus')

    expect(presenceSent()).toEqual([
      ['machine', 'notifications.presence', { active: true }],
    ])
  })

  it('says it at most once every 5 seconds while you keep using it', () => {
    fire('pointerdown')
    vi.setSystemTime(now + 4999)
    fire('keydown')
    fire('wheel')
    expect(presenceSent()).toHaveLength(1)

    vi.setSystemTime(now + 5000)
    fire('keydown')
    expect(presenceSent()).toHaveLength(2)
  })

  it('tells every connected server, but not one that is offline', () => {
    fake.machines = ['machine', 'other', 'offline']
    fake.connected = ['machine', 'other']

    fire('keydown')

    expect(presenceSent()).toEqual([
      ['machine', 'notifications.presence', { active: true }],
      ['other', 'notifications.presence', { active: true }],
    ])
  })

  it('counts the page becoming visible again as using it', () => {
    document.dispatchEvent(new Event('visibilitychange'))

    expect(presenceSent()).toEqual([
      ['machine', 'notifications.presence', { active: true }],
    ])
  })

  it('keeps working when a server could not be told', async () => {
    vi.mocked(connection.call).mockRejectedValueOnce(new Error('offline'))

    fire('pointerdown')
    await vi.waitFor(() => expect(fake.logError).toHaveBeenCalled())
    vi.setSystemTime(now + 5000)
    fire('pointerdown')

    expect(presenceSent()).toHaveLength(2)
  })

  it('ignores input while the window is not focused', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    fire('pointerdown')

    expect(presenceSent()).toEqual([])
  })

  it('says you left when the window loses focus, is hidden or closes', () => {
    fire('blur')
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    document.dispatchEvent(new Event('visibilitychange'))
    fire('pagehide')

    expect(presenceSent()).toEqual([
      ['machine', 'notifications.presence', { active: false }],
      ['machine', 'notifications.presence', { active: false }],
      ['machine', 'notifications.presence', { active: false }],
    ])
  })

  it('says it again right away after you come back', () => {
    fire('pointerdown')
    fire('blur')
    vi.setSystemTime(now + 1000)
    fire('pointerdown')

    expect(presenceSent().map((call) => call[2])).toEqual([
      { active: true },
      { active: false },
      { active: true },
    ])
  })

  it('tells a server that reconnects only if you used the page in the last 15 seconds', () => {
    fire('pointerdown')
    vi.mocked(connection.call).mockClear()

    vi.setSystemTime(now + 14_999)
    notifications.reportPresence('machine')
    expect(presenceSent()).toEqual([
      ['machine', 'notifications.presence', { active: true }],
    ])

    vi.setSystemTime(now + 15_000)
    notifications.reportPresence('machine')
    expect(presenceSent()).toHaveLength(1)
  })

  it('does not tell a server that reconnects while the window is not focused', () => {
    fire('pointerdown')
    vi.mocked(connection.call).mockClear()
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)

    notifications.reportPresence('machine')

    expect(presenceSent()).toEqual([])
  })

  it('answers that you are here and shows it when you used the page in the last 15 seconds', async () => {
    fire('pointerdown')
    vi.mocked(connection.call).mockClear()
    vi.setSystemTime(now + 14_999)

    await notifications.answerNotice('machine', notice)

    expect(presenceSent()).toEqual([
      ['machine', 'notices.here', { id: 'notice', here: true }],
    ])
    expect(shownTitles()).toEqual(['Fix login'])
  })

  it('answers that you left and shows nothing once the page has not been used for 15 seconds', async () => {
    fire('pointerdown')
    vi.mocked(connection.call).mockClear()
    vi.setSystemTime(now + 15_000)

    await notifications.answerNotice('machine', notice)

    expect(presenceSent()).toEqual([
      ['machine', 'notices.here', { id: 'notice', here: false }],
    ])
    expect(shownTitles()).toEqual([])
  })

  it('answers that you left when the window lost focus since you used it', async () => {
    fire('pointerdown')
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    vi.mocked(connection.call).mockClear()

    await notifications.answerNotice('machine', notice)

    expect(presenceSent()).toEqual([
      ['machine', 'notices.here', { id: 'notice', here: false }],
    ])
    expect(shownTitles()).toEqual([])
  })

  it('answers that you are here but shows nothing on a desktop window you are using', async () => {
    fake.wide.matches = true
    fire('pointerdown')
    vi.mocked(connection.call).mockClear()

    await notifications.answerNotice('machine', notice)

    expect(presenceSent()).toEqual([
      ['machine', 'notices.here', { id: 'notice', here: true }],
    ])
    expect(shownTitles()).toEqual([])
  })

  it('shows nothing itself when the answer could not be sent, so the server pushes it', async () => {
    fire('pointerdown')
    vi.mocked(connection.call).mockRejectedValueOnce(new Error('offline'))

    await expect(notifications.answerNotice('machine', notice)).rejects.toThrow(
      'offline'
    )

    expect(shownTitles()).toEqual([])
  })
})
