import {
  attentionCount,
  beep,
  forgetTab,
  noteInput,
  noteMessage,
  noteOutput,
  notifyFromProgram,
  ringBell,
  syncQuietTimers,
  unseenAttention,
  updateAppBadge,
} from './attention'
import {
  applyStyle,
  type Config,
  type Platform,
  terminalOptions,
} from './config'
import { updateFavicon } from './favicon'
import { type FindResults, type Progress, Terminal } from './ghostty/terminal'
import {
  imagePasteKeys,
  isImagePasteKey,
  pasteClipboardImages,
  pasteImages,
  reportPasteError,
} from './paste'
import { themeColors } from './themes'

export type Tab = { id: number; customName: string | null; minimized: boolean }
type Group = {
  id: number
  name: string
  logo: string | null
  directory: string | null
  background: string | null
  tabs: Tab[]
  activeTab: number | null
}
type Layout = { groups: Group[]; activeGroup: number | null }
type State = {
  status: 'connecting' | 'active' | 'paused'
  layout: Layout
  ctrl: boolean
  config: Config
  platform: Platform
  version: string
  titles: Record<number, string>
  branches: Record<number, string>
  progress: Record<number, Progress>
  alerts: number[]
  finding: number | null
  unread: number[]
  quiet: number[]
}

type Request =
  | { type: 'hello'; clientId: string }
  | { type: 'resume'; clientId: string }
  | { type: 'ping' }
  | { type: 'createGroup' }
  | { type: 'createTab'; groupId: number }
  | { type: 'closeGroup'; id: number }
  | { type: 'closeTab'; id: number }
  | { type: 'renameGroup'; id: number; name: string }
  | { type: 'moveGroup'; id: number; index: number }
  | { type: 'renameTab'; id: number; name: string }
  | { type: 'minimizeTab'; id: number }
  | { type: 'setDirectory'; id: number; directory: string }
  | { type: 'select'; groupId: number; tabId: number | null }
  | { type: 'resize'; id: number; cols: number; rows: number }

type Message =
  | {
      type: 'active'
      layout: Layout
      instance: string
      branches: Record<number, string>
    }
  | { type: 'layout'; layout: Layout }
  | { type: 'paused' }
  | { type: 'config'; config: Config }
  | { type: 'branch'; id: number; branch: string | null }
  | { type: 'pong' }

const typedAt = new Map<number, number>()
const isMac = navigator.userAgent.includes('Mac')

export const clientId =
  sessionStorage.getItem('clientId') ??
  Math.random().toString(36).slice(2) + Date.now().toString(36)
sessionStorage.setItem('clientId', clientId)

const encoder = new TextEncoder()
const sessions = new Map<number, Terminal>()
const awaitingReplay = new Set<number>()
const listeners = new Set<() => void>()
let state: State
let socket: WebSocket
let pongTimer: number | null = null
let instance: string | null = null

export function start(config: Config, platform: Platform, version: string) {
  state = {
    status: 'connecting',
    layout: { groups: [], activeGroup: null },
    ctrl: false,
    config,
    platform,
    version,
    titles: {},
    branches: {},
    progress: {},
    alerts: [],
    finding: null,
    unread: [],
    quiet: [],
  }
  socket = connect()
  setInterval(checkConnection, 30_000)
  document.addEventListener('visibilitychange', () => {
    setState({})
    if (!document.hidden) checkConnection()
  })
  window.addEventListener('focus', () => setState({}))
  window.addEventListener('blur', () => setState({}))
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type !== 'select') return
      send({
        type: 'select',
        groupId: event.data.groupId,
        tabId: event.data.tabId,
      })
    })
}

export function checkConnection() {
  if (state.status === 'connecting' || pongTimer !== null) return
  if (socket.readyState !== WebSocket.OPEN) return
  send({ type: 'ping' })
  pongTimer = window.setTimeout(() => {
    pongTimer = null
    socket.onclose = null
    socket.close()
    setState({ status: 'connecting' })
    socket = connect()
  }, 3000)
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getState() {
  return state
}

export function setState(next: Partial<State>) {
  state = { ...state, ...next }
  state = { ...state, ...unseenAttention((id) => sessions.has(id)) }
  const group = state.layout.groups.find(
    (item) => item.id === state.layout.activeGroup
  )
  const tab = group?.tabs.find((item) => item.id === group.activeTab)
  const count = attentionCount()
  updateAppBadge(count)
  syncQuietTimers()
  document.title =
    (state.alerts.length > 0 ? '🔔 ' : '') +
    (count > 0 ? `(${count}) ` : '') +
    (tab ? tabTitle(tab) : group ? group.name : 'sshtty')
  updateFavicon(
    group ? group.logo : null,
    themeColors(state.config.theme),
    count
  )
  for (const listener of listeners) listener()
}

export function tabTitle(tab: Tab) {
  return (tab.customName ?? state.titles[tab.id]) || 'Terminal'
}

export async function uploadLogo(groupId: number, file: File) {
  const response = await fetch(`/api/groups/${groupId}/logo`, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!response.ok) throw new Error(await response.text())
}

export async function removeLogo(groupId: number) {
  const response = await fetch(`/api/groups/${groupId}/logo`, {
    method: 'DELETE',
  })
  if (!response.ok) throw new Error(await response.text())
}

export function send(request: Request) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(request))
}

export function sendInput(id: number, data: string | Uint8Array) {
  noteInput(id)
  sendReply(id, data)
}

function sendReply(id: number, data: string | Uint8Array) {
  if (socket.readyState !== WebSocket.OPEN) return
  const bytes = typeof data === 'string' ? encoder.encode(data) : data
  const message = new Uint8Array(8 + bytes.length)
  new DataView(message.buffer).setBigUint64(0, BigInt(id))
  message.set(bytes, 8)
  socket.send(message)
}

export function find(
  id: number,
  text: string,
  backwards: boolean,
  incremental: boolean
) {
  getSession(id).find(text, backwards, incremental)
}

export function onFindResults(
  id: number,
  listener: (results: FindResults) => void
) {
  return getSession(id).onFindResults(listener)
}

export function closeFind(id: number) {
  const terminal = getSession(id)
  terminal.clearFind()
  setState({ finding: null })
  terminal.focus()
}

export function toggleCtrl() {
  setState({ ctrl: !state.ctrl })
}

function connect() {
  const next = new WebSocket(
    `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
  )
  next.binaryType = 'arraybuffer'
  next.onopen = () => send({ type: 'hello', clientId })
  next.onmessage = (event) => {
    if (pongTimer !== null) window.clearTimeout(pongTimer)
    pongTimer = null
    if (event.data instanceof ArrayBuffer) {
      const view = new DataView(event.data)
      const id = Number(view.getBigUint64(0))
      const replay = view.getUint8(8) === 1
      const terminal = sessions.get(id)
      if (!terminal) return
      const awaited = replay && awaitingReplay.delete(id)
      if (awaited) terminal.reset()
      const bytes = new Uint8Array(event.data, 9)
      terminal.write(bytes, replay)
      if (awaited && awaitingReplay.size === 0) setState({ status: 'active' })
      if (!replay) noteOutput(id, bytes)
      noteMessage()
      const typed = typedAt.get(id)
      if (replay || typed === undefined) return
      typedAt.delete(id)
      requestAnimationFrame(() =>
        console.log(
          `[latency] key to screen: ${(performance.now() - typed).toFixed(1)}ms`
        )
      )
      return
    }
    handle(JSON.parse(event.data))
    noteMessage()
  }
  next.onclose = () => {
    if (pongTimer !== null) window.clearTimeout(pongTimer)
    pongTimer = null
    setState({ status: 'connecting' })
    setTimeout(() => {
      socket = connect()
    }, 1000)
  }
  return next
}

function handle(message: Message) {
  if (message.type === 'pong') return
  if (message.type === 'config') {
    void applyConfig(message.config)
    return
  }
  if (message.type === 'branch') {
    const branches = { ...state.branches }
    if (message.branch === null) delete branches[message.id]
    else branches[message.id] = message.branch
    setState({ branches })
    return
  }
  if (message.type === 'paused') {
    setState({ status: 'paused' })
    return
  }
  if (message.type === 'active') {
    if (instance !== null && message.instance !== instance) {
      location.reload()
      return
    }
    instance = message.instance
  }
  sync(message.layout)
  if (message.type === 'active') {
    awaitingReplay.clear()
    sessions.forEach((terminal, id) => {
      awaitingReplay.add(id)
      if (terminal.element.isConnected) reportSize(id, terminal)
    })
    setState({
      status: awaitingReplay.size === 0 ? 'active' : 'connecting',
      layout: message.layout,
      branches: message.branches,
    })
    return
  }
  for (const id of awaitingReplay)
    if (!sessions.has(id)) awaitingReplay.delete(id)
  setState({
    status: awaitingReplay.size === 0 ? 'active' : 'connecting',
    layout: message.layout,
  })
}

function sync(layout: Layout) {
  const ids = new Set(
    layout.groups.flatMap((group) => group.tabs.map((tab) => tab.id))
  )
  sessions.forEach((terminal, id) => {
    if (ids.has(id)) return
    terminal.dispose()
    sessions.delete(id)
    forgetTab(id)
  })
  for (const id of ids) {
    if (!sessions.has(id)) sessions.set(id, createSession(id))
  }
}

export function isFindShortcut(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== 'f') return false
  if (isMac) return event.metaKey && !event.ctrlKey && !event.altKey
  return event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
}

function isShiftEnter(event: KeyboardEvent) {
  return (
    event.key === 'Enter' &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.metaKey
  )
}

function createSession(id: number) {
  const terminal = new Terminal(terminalOptions(state.config, state.version), {
    onData: (data) => {
      if (state.status !== 'active') return
      if (!typedAt.has(id)) typedAt.set(id, performance.now())
      sendInput(id, applyCtrl(data))
    },
    onReply: (data) => {
      if (data === '\x1b[I' || data === '\x1b[O') sendInput(id, data)
      else sendReply(id, data)
    },
    onResize: (cols, rows) => {
      noteInput(id)
      send({ type: 'resize', id, cols, rows })
    },
    onTitle: (title) => setState({ titles: { ...state.titles, [id]: title } }),
    onProgress: (progress) =>
      setState({ progress: { ...state.progress, [id]: progress } }),
    onBell: () => {
      if (state.config.behavior.bellSound) beep()
      if (
        state.config.behavior.bellFlash &&
        terminal.element.isConnected &&
        !document.hidden
      )
        terminal.element.animate([{ opacity: 0.4 }, { opacity: 1 }], {
          duration: 200,
          easing: 'ease-out',
        })
      ringBell(id)
    },
    onNotify: (title, body) => notifyFromProgram(id, title, body),
    onClipboard: (text) => {
      if (!window.isSecureContext) {
        console.warn('copy from the terminal needs https or localhost')
        return
      }
      void navigator.clipboard.writeText(text)
    },
    onLink: (uri) => window.open(uri, '_blank', 'noopener'),
    beforeKey: (event) => {
      if (event.type !== 'keydown') return true
      if (
        state.status === 'active' &&
        state.config.behavior.modernizeShiftEnter &&
        isShiftEnter(event) &&
        !terminal.isKittyKeyboard()
      ) {
        event.preventDefault()
        sendInput(id, '\x1b\r')
        return false
      }
      if (
        state.status === 'active' &&
        state.config.behavior.pasteBrowserImages &&
        window.isSecureContext &&
        isImagePasteKey(event, state.platform)
      ) {
        event.preventDefault()
        const data = imagePasteKeys[state.platform].data
        pasteClipboardImages(terminal)
          .then((pasted) => {
            if (!pasted) sendInput(id, data)
          })
          .catch((error: unknown) => {
            reportPasteError(error)
            sendInput(id, data)
          })
        return false
      }
      if (!isFindShortcut(event)) return true
      event.preventDefault()
      setState({ finding: id })
      document.querySelector<HTMLInputElement>('[data-find]')?.select()
      return false
    },
  })
  terminal.element.addEventListener(
    'paste',
    (event) => {
      if (!event.clipboardData) return
      if (event.clipboardData.getData('text/plain') !== '') return
      const images = [...event.clipboardData.files].filter((file) =>
        file.type.startsWith('image/')
      )
      if (images.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      pasteImages(terminal, images).catch(reportPasteError)
    },
    true
  )
  return terminal
}

function applyCtrl(data: string) {
  if (!state.ctrl) return data
  setState({ ctrl: false })
  if (data.length !== 1) return data
  const code = data.toUpperCase().charCodeAt(0)
  if (code >= 64 && code <= 95) return String.fromCharCode(code - 64)
  return data
}

function reportSize(id: number, terminal: Terminal) {
  noteInput(id)
  send({ type: 'resize', id, cols: terminal.cols, rows: terminal.rows })
}

export function getSession(id: number) {
  const session = sessions.get(id)
  if (!session) throw new Error(`terminal ${id} does not exist`)
  return session
}

export function mount(id: number, container: HTMLElement) {
  const terminal = getSession(id)
  container.appendChild(terminal.element)
  terminal.fit()
  for (const other of sessions.values())
    other.presize(terminal.cols, terminal.rows)
  reportSize(id, terminal)
  terminal.focus()
  return () => {
    terminal.element.remove()
  }
}

export async function applyConfig(config: Config) {
  await applyStyle(config)
  setState({ config })
  for (const terminal of sessions.values())
    terminal.setOptions(terminalOptions(config, state.version))
}
