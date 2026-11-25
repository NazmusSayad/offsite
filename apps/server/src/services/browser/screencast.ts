import { setTimeout as sleep } from 'node:timers/promises'
import type { BrowserSize } from '@offsite/core/browser'
import { ignoreClosed } from './chrome.ts'
import type { Tab, Viewer } from './tabs.ts'

const QUALITY = 75
const SWAP_TRIES = 20
const SWAP_WAIT = 50

export async function resize(tab: Tab, size: BrowserSize) {
  tab.size = { width: size.width, height: size.height, scale: size.scale }
  await whileSwapping(() =>
    tab.cdp.send('Emulation.setDeviceMetricsOverride', {
      width: tab.size.width,
      height: tab.size.height,
      deviceScaleFactor: tab.size.scale,
      mobile: false,
    })
  )
  if (tab.viewer !== null) {
    await startScreencast(tab)
  }
}

export async function startScreencast(tab: Tab) {
  await whileSwapping(async () => {
    await tab.cdp.send('Page.stopScreencast')
    await tab.cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: QUALITY,
      maxWidth: Math.round(tab.size.width * tab.size.scale),
      maxHeight: Math.round(tab.size.height * tab.size.scale),
    })
  })
}

export async function whileSwapping<T>(action: () => Promise<T>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action()
    } catch (error) {
      if (
        attempt === SWAP_TRIES ||
        !(error instanceof Error) ||
        !error.message.includes('Not attached to an active page')
      ) {
        throw error
      }
      await sleep(SWAP_WAIT)
    }
  }
}

export function showFrame(
  tab: Tab,
  frame: { data: string; sessionId: number }
) {
  const viewer = tab.viewer
  if (viewer === null) {
    ackFrame(tab, frame.sessionId)
    return
  }
  const image = Buffer.from(frame.data, 'base64')
  if (viewer.sent === null) {
    viewer.sent = frame.sessionId
    viewer.socket.send(image)
    return
  }
  if (viewer.waiting !== null) {
    ackFrame(tab, viewer.waiting.sessionId)
  }
  viewer.waiting = { image, sessionId: frame.sessionId }
}

export function acknowledge(tab: Tab, viewer: Viewer) {
  if (viewer.sent !== null) {
    ackFrame(tab, viewer.sent)
  }
  viewer.sent = null
  const next = viewer.waiting
  viewer.waiting = null
  if (next !== null) {
    viewer.sent = next.sessionId
    viewer.socket.send(next.image)
  }
}

function ackFrame(tab: Tab, sessionId: number) {
  tab.cdp.send('Page.screencastFrameAck', { sessionId }).catch(ignoreClosed)
}
