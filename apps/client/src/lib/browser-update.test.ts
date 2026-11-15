import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => {
  type Listener = (event: { isUpdate?: boolean; isExternal?: boolean }) => void

  class Workbox {
    static last: Workbox | undefined
    url: string
    options: RegistrationOptions
    listeners = new Map<string, Listener>()
    register = vi.fn(async () => undefined)
    update = vi.fn(async () => undefined)
    messageSkipWaiting = vi.fn()

    constructor(url: string, options: RegistrationOptions) {
      this.url = url
      this.options = options
      Workbox.last = this
    }

    addEventListener(type: string, listener: Listener) {
      this.listeners.set(type, listener)
    }
  }

  return { Workbox, storeUpdate: vi.fn() }
})

vi.mock('workbox-window', () => ({ Workbox: fake.Workbox }))
vi.mock('@/lib/store', () => ({ update: fake.storeUpdate }))

const getRegistration = vi.fn()
const reload = vi.fn()

async function start() {
  const browserUpdate = await import('./browser-update')
  await browserUpdate.startBrowserUpdates()
  return browserUpdate
}

function registered() {
  if (fake.Workbox.last === undefined) {
    throw new Error('no service worker was registered')
  }
  return fake.Workbox.last
}

function emit(
  type: string,
  event: { isUpdate?: boolean; isExternal?: boolean }
) {
  const listener = registered().listeners.get(type)
  if (listener === undefined) {
    throw new Error(`nothing listens for ${type}`)
  }
  listener(event)
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubEnv('DEV', false)
  fake.Workbox.last = undefined
  fake.storeUpdate.mockClear()
  getRegistration.mockReset()
  reload.mockClear()
  sessionStorage.clear()
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration },
  })
  vi.spyOn(location, 'reload').mockImplementation(reload)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  document.head.replaceChildren()
})

describe('startBrowserUpdates', () => {
  it('registers the service worker that saves files when the app has a manifest', async () => {
    const link = document.createElement('link')
    link.rel = 'manifest'
    document.head.append(link)
    await start()
    expect(registered().url).toBe('/sw.js?pwa')
    expect(registered().options).toEqual({ type: 'classic' })
    expect(registered().register).toHaveBeenCalledOnce()
  })

  it('registers the service worker that saves nothing when the app has no manifest', async () => {
    await start()
    expect(registered().url).toBe('/sw.js')
  })

  it('registers the dev service worker in dev', async () => {
    vi.stubEnv('DEV', true)
    await start()
    expect(registered().url).toBe('/dev-sw.js?dev-sw')
    expect(registered().options).toEqual({ type: 'module' })
  })

  it('shows the update row when a new version is waiting', async () => {
    await start()
    emit('waiting', {})
    expect(fake.storeUpdate).toHaveBeenCalledWith({ browserUpdate: true })
  })

  it('reloads when a new version takes over a page that had one', async () => {
    await start()
    emit('controlling', { isUpdate: true, isExternal: false })
    expect(reload).toHaveBeenCalledOnce()
  })

  it('reloads when a version found later takes over', async () => {
    await start()
    emit('controlling', { isUpdate: false, isExternal: true })
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not reload when the first version takes over', async () => {
    await start()
    emit('controlling', { isUpdate: false, isExternal: false })
    expect(reload).not.toHaveBeenCalled()
  })

  it('checks for a new version every hour', async () => {
    await start()
    expect(registered().update).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60 * 60_000)
    expect(registered().update).toHaveBeenCalledOnce()
  })

  it('reloads once when a file fails to load', async () => {
    await start()
    dispatchEvent(new Event('vite:preloadError'))
    dispatchEvent(new Event('vite:preloadError'))
    expect(reload).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(30_000)
    dispatchEvent(new Event('vite:preloadError'))
    expect(reload).toHaveBeenCalledTimes(2)
  })
})

describe('applyBrowserUpdate', () => {
  it('switches to the waiting version', async () => {
    const browserUpdate = await start()
    getRegistration.mockResolvedValue({ waiting: {} })
    await browserUpdate.applyBrowserUpdate()
    expect(registered().messageSkipWaiting).toHaveBeenCalledOnce()
  })

  it('fails when no version is waiting', async () => {
    const browserUpdate = await start()
    getRegistration.mockResolvedValue({ waiting: null })
    await expect(browserUpdate.applyBrowserUpdate()).rejects.toThrow(
      'the new version is no longer waiting'
    )
    expect(registered().messageSkipWaiting).not.toHaveBeenCalled()
  })
})
