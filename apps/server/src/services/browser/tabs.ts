import type {
  BrowserDialog,
  BrowserInput,
  BrowserOutput,
  BrowserSize,
} from '@offsite/core/browser'
import type { CDPSession, Dialog, FileChooser, Page } from 'playwright-core'
import type { WebSocket } from 'ws'
import { logger } from '../../lib/log.ts'
import { addLink } from '../files.ts'
import {
  closeContext,
  ignoreClosed,
  needsInstall,
  openContext,
} from './chrome.ts'
import { dispatch } from './input.ts'
import { COPY_BINDING, COPY_SCRIPT, editableAt } from './page-script.ts'
import {
  acknowledge,
  resize,
  showFrame,
  startScreencast,
  whileSwapping,
} from './screencast.ts'

export type Viewer = {
  socket: WebSocket
  device: string | null
  sent: number | null
  waiting: { image: Buffer; sessionId: number } | null
}

export type Tab = {
  id: string
  page: Page
  cdp: CDPSession
  mainFrame: string
  size: BrowserSize
  viewer: Viewer | null
  state: Omit<Extract<BrowserOutput, { type: 'state' }>, 'type'>
  problem: string | null
  failure: { url: string; text: string } | null
  dialog: Dialog | null
  chooser: FileChooser | null
  input: Promise<void>
  touchedAt: number
  idle: NodeJS.Timeout | null
}

export type Input = Exclude<BrowserInput, { type: 'open' }>

const log = logger.withTag('browser')
const IDLE_CLOSE = 5 * 60_000
const COPY_WINDOW = 2000
const tabs = new Map<string, Promise<Tab>>()
const tabsByPage = new Map<Page, Tab>()

export async function attachViewer(
  viewer: Viewer,
  open: Extract<BrowserInput, { type: 'open' }>
) {
  let opening = tabs.get(open.page)
  const created = opening === undefined
  if (opening === undefined) {
    if (needsInstall()) {
      send(viewer, { type: 'installing' })
    }
    opening = createTab(open.page, open)
    tabs.set(open.page, opening)
    opening.catch(() => tabs.delete(open.page))
  }
  const tab = await opening
  if (tab.viewer !== null) {
    tab.viewer.socket.close(4000, 'another viewer opened this page')
    detachViewer(tab, tab.viewer)
  }
  if (tab.idle !== null) {
    clearTimeout(tab.idle)
    tab.idle = null
  }
  tab.viewer = viewer
  if (
    open.width !== tab.size.width ||
    open.height !== tab.size.height ||
    open.scale !== tab.size.scale
  ) {
    await resize(tab, open)
  } else {
    await startScreencast(tab)
  }
  send(viewer, { type: 'viewport', width: open.width, height: open.height })
  send(viewer, { type: 'state', ...tab.state })
  send(viewer, { type: 'dialog', dialog: dialogOf(tab.dialog) })
  if (created || open.url !== tab.state.url) {
    navigate(tab, open.url).catch(ignoreClosed)
  }
  return tab
}

export function detachViewer(tab: Tab, viewer: Viewer) {
  if (tab.viewer !== viewer) {
    return
  }
  tab.viewer = null
  tab.cdp.send('Page.stopScreencast').catch(ignoreClosed)
  tab.idle = setTimeout(() => closeTab(tab).catch(ignoreClosed), IDLE_CLOSE)
}

export function receive(tab: Tab, viewer: Viewer, input: Input) {
  if (tab.viewer !== viewer) {
    return
  }
  if (
    input.type === 'mouse' ||
    input.type === 'wheel' ||
    input.type === 'key' ||
    input.type === 'text'
  ) {
    if (
      (input.type === 'mouse' && input.action === 'down') ||
      (input.type === 'key' && input.action === 'down')
    ) {
      tab.touchedAt = Date.now()
    }
    tab.input = tab.input.then(() => dispatch(tab, input)).catch(ignoreClosed)
    return
  }
  answer(tab, viewer, input).catch(ignoreClosed)
}

async function answer(
  tab: Tab,
  viewer: Viewer,
  input: Exclude<Input, { type: 'mouse' | 'wheel' | 'key' | 'text' }>
) {
  if (input.type === 'ack') {
    acknowledge(tab, viewer)
    return
  }
  if (input.type === 'size') {
    await resize(tab, input)
    send(viewer, { type: 'viewport', width: input.width, height: input.height })
    return
  }
  if (input.type === 'probe') {
    send(viewer, {
      type: 'probe',
      editable: (await tab.page.evaluate(editableAt(input))) === true,
    })
    return
  }
  if (input.type === 'navigate') {
    await navigate(tab, input.url)
    return
  }
  if (input.type === 'back' || input.type === 'forward') {
    await travel(tab, input.type)
    return
  }
  if (input.type === 'reload') {
    await travel(tab, 'reload')
    return
  }
  if (input.type === 'dialog') {
    const dialog = tab.dialog
    tab.dialog = null
    send(viewer, { type: 'dialog', dialog: null })
    if (dialog === null) {
      return
    }
    await (input.accept ? dialog.accept(input.text) : dialog.dismiss())
    return
  }
  if (input.type === 'files') {
    const chooser = tab.chooser
    tab.chooser = null
    await chooser?.setFiles(
      input.files.map((file) => ({
        name: file.name,
        mimeType: file.type,
        buffer: Buffer.from(file.data, 'base64'),
      }))
    )
    return
  }
  throw new Error(`unknown browser input ${JSON.stringify(input)}`)
}

async function createTab(id: string, size: BrowserSize) {
  const context = await openContext()
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Page.enable')
  const tree = await cdp.send('Page.getFrameTree')
  const tab: Tab = {
    id,
    page,
    cdp,
    mainFrame: tree.frameTree.frame.id,
    size,
    viewer: null,
    state: { url: '', loading: true, back: false, forward: false, error: null },
    problem: null,
    failure: null,
    dialog: null,
    chooser: null,
    input: Promise.resolve(),
    touchedAt: 0,
    idle: null,
  }
  tabsByPage.set(page, tab)
  await page.exposeBinding(COPY_BINDING, (_source, text: unknown) => {
    if (typeof text === 'string' && Date.now() - tab.touchedAt < COPY_WINDOW) {
      sendTo(tab, { type: 'copy', text })
    }
  })
  await page.addInitScript(COPY_SCRIPT)
  cdp.on('Page.screencastFrame', (frame) => showFrame(tab, frame))
  cdp.on('Page.frameStartedLoading', (event) => {
    if (event.frameId === tab.mainFrame) {
      tab.state.loading = true
      tab.problem = null
      report(tab).catch(ignoreClosed)
    }
  })
  cdp.on('Page.frameStoppedLoading', (event) => {
    if (event.frameId === tab.mainFrame) {
      tab.state.loading = false
      report(tab).catch(ignoreClosed)
    }
  })
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      report(tab).catch(ignoreClosed)
    }
  })
  page.on('requestfailed', (request) => {
    const text = request.failure()?.errorText
    if (
      text !== undefined &&
      request.isNavigationRequest() &&
      request.frame() === page.mainFrame()
    ) {
      tab.failure = { url: request.url(), text: text.replace('net::', '') }
    }
  })
  page.on('dialog', (dialog) => {
    tab.dialog = dialog
    sendTo(tab, { type: 'dialog', dialog: dialogOf(dialog) })
  })
  page.on('filechooser', (chooser) =>
    chooseFiles(tab, chooser).catch(ignoreClosed)
  )
  page.on('download', (download) =>
    offerDownload(tab, download).catch(ignoreClosed)
  )
  page.on('popup', (popup) => followPopup(tab, popup).catch(ignoreClosed))
  page.on('close', () => forget(tab, 'the page closed'))
  page.on('crash', () => {
    forget(tab, 'the page crashed')
    page.close().catch(ignoreClosed)
  })
  await resize(tab, size)
  log.info(`opened browser page ${id}`)
  return tab
}

async function closeTab(tab: Tab) {
  forget(tab, 'nobody watched the page')
  await tab.page.close()
}

function forget(tab: Tab, reason: string) {
  if (!tabsByPage.has(tab.page)) {
    return
  }
  tabsByPage.delete(tab.page)
  tabs.delete(tab.id)
  if (tab.idle !== null) {
    clearTimeout(tab.idle)
  }
  tab.viewer?.socket.close(4404, reason)
  tab.viewer = null
  log.info(`closed browser page ${tab.id}: ${reason}`)
  if (tabs.size === 0) {
    closeContext().catch(ignoreClosed)
  }
}

function sendTo(tab: Tab, message: BrowserOutput) {
  if (tab.viewer !== null) {
    send(tab.viewer, message)
  }
}

function send(viewer: Viewer, message: BrowserOutput) {
  viewer.socket.send(JSON.stringify(message))
}

async function navigate(tab: Tab, url: string) {
  const target = URL.parse(url)
  if (
    target === null ||
    (target.protocol !== 'http:' && target.protocol !== 'https:')
  ) {
    fail(tab, `${url} is not an http or https address`)
    return
  }
  try {
    await tab.page.goto(target.href, { waitUntil: 'commit', timeout: 0 })
  } catch (error) {
    failNavigation(tab, error)
  }
}

async function travel(tab: Tab, direction: 'back' | 'forward' | 'reload') {
  try {
    if (direction === 'back') {
      await tab.page.goBack({ waitUntil: 'commit', timeout: 0 })
    }
    if (direction === 'forward') {
      await tab.page.goForward({ waitUntil: 'commit', timeout: 0 })
    }
    if (direction === 'reload') {
      await tab.page.reload({ waitUntil: 'commit', timeout: 0 })
    }
  } catch (error) {
    failNavigation(tab, error)
  }
}

function failNavigation(tab: Tab, error: unknown) {
  if (!(error instanceof Error)) {
    throw error
  }
  if (
    error.message.includes('net::') ||
    error.message.includes('interrupted by another navigation') ||
    error.message.includes('Target page, context or browser has been closed')
  ) {
    return
  }
  const line = error.message.split('\n')[0] ?? error.message
  fail(tab, line.replace(/^\w+\.\w+: /, ''))
}

function fail(tab: Tab, message: string) {
  tab.problem = message
  tab.state.loading = false
  report(tab).catch(ignoreClosed)
}

async function report(tab: Tab) {
  const history = await whileSwapping(() =>
    tab.cdp.send('Page.getNavigationHistory')
  )
  const url = history.entries[history.currentIndex]?.url ?? ''
  if (isWeb(url)) {
    tab.state.url = url
  }
  const failure = tab.failure?.url === url ? ` (${tab.failure.text})` : ''
  tab.state.error = tab.page.url().startsWith('chrome-error:')
    ? `Could not load ${url}${failure}`
    : tab.problem
  tab.state.back = history.entries
    .slice(0, history.currentIndex)
    .some((entry) => isWeb(entry.url))
  tab.state.forward = history.currentIndex < history.entries.length - 1
  sendTo(tab, { type: 'state', ...tab.state })
}

async function chooseFiles(tab: Tab, chooser: FileChooser) {
  tab.chooser = chooser
  sendTo(tab, {
    type: 'files',
    multiple: chooser.isMultiple(),
    accept: (await chooser.element().getAttribute('accept')) ?? '',
  })
}

async function offerDownload(
  tab: Tab,
  download: { path(): Promise<string>; suggestedFilename(): string }
) {
  const file = await download.path()
  const viewer = tab.viewer
  if (viewer === null) {
    log.warn(`nobody was watching to save ${download.suggestedFilename()}`)
    return
  }
  send(viewer, {
    type: 'download',
    name: download.suggestedFilename(),
    token: addLink(file, 'application/octet-stream', viewer.device),
  })
}

async function followPopup(tab: Tab, popup: Page) {
  const url = await popup
    .waitForURL((address) => address.href !== 'about:blank', {
      waitUntil: 'commit',
    })
    .then(() => popup.url())
    .finally(() => popup.close())
  await navigate(tab, url)
}

function dialogOf(dialog: Dialog | null): BrowserDialog | null {
  if (dialog === null) {
    return null
  }
  const kind = dialog.type()
  if (
    kind !== 'alert' &&
    kind !== 'confirm' &&
    kind !== 'prompt' &&
    kind !== 'beforeunload'
  ) {
    throw new Error(`unknown dialog type ${kind}`)
  }
  return { kind, message: dialog.message(), value: dialog.defaultValue() }
}

function isWeb(url: string) {
  return url.startsWith('http:') || url.startsWith('https:')
}
