import {
  applyStyle,
  type Config,
  type Platform,
  terminalOptions,
} from './config'
import { updateFavicon } from './favicon'
import { type FindResults, type Progress, Terminal } from './ghostty/terminal'
import { themeColors } from './themes'

type Tab = { id: number; customName: string | null }
type Group = {
  id: number
  name: string
  logo: string | null
  directory: string | null
  tabs: Tab[]
  activeTab: number | null
}
type Layout = { groups: Group[]; activeGroup: number | null; nextId: number }
type State = {
  status: 'connecting' | 'active' | 'paused'
  layout: Layout
  ctrl: boolean
  config: Config
  platform: Platform
  titles: Record<number, string>
  branches: Record<number, string>
  progress: Record<number, Progress>
  finding: number | null
}

type Request =
  | { type: 'hello'; clientId: string }
  | { type: 'resume'; clientId: string }
  | { type: 'createGroup' }
  | { type: 'createTab'; groupId: number }
  | { type: 'close'; id: number }
  | { type: 'rename'; id: number; name: string }
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

const typedAt = new Map<number, number>()
const isMac = navigator.userAgent.includes('Mac')

export const clientId =
  sessionStorage.getItem('clientId') ??
  Math.random().toString(36).slice(2) + Date.now().toString(36)
sessionStorage.setItem('clientId', clientId)

const encoder = new TextEncoder()
const sessions = new Map<number, Terminal>()
const listeners = new Set<() => void>()
let state: State
let socket: WebSocket
let hiddenAt = 0
let instance: string | null = null

export function start(config: Config, platform: Platform) {
  state = {
    status: 'connecting',
    layout: { groups: [], activeGroup: null, nextId: 0 },
    ctrl: false,
    config,
    platform,
    titles: {},
    branches: {},
    progress: {},
    finding: null,
  }
  socket = connect()
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now()
      return
    }
    if (Date.now() - hiddenAt > 10_000) {
      socket.onclose = null
      socket.close()
      socket = connect()
    }
  })
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

function setState(next: Partial<State>) {
  state = { ...state, ...next }
  const group = state.layout.groups.find(
    (item) => item.id === state.layout.activeGroup
  )
  const tab = group?.tabs.find((item) => item.id === group.activeTab)
  document.title = tab ? tabTitle(tab) : group ? group.name : 'sshtty'
  updateFavicon(group ? group.logo : null, themeColors(state.config.theme))
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
    if (event.data instanceof ArrayBuffer) {
      const view = new DataView(event.data)
      const id = Number(view.getBigUint64(0))
      const replay = view.getUint8(8) === 1
      const terminal = sessions.get(id)
      if (!terminal) return
      terminal.write(new Uint8Array(event.data, 9), replay)
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
  }
  next.onclose = () => {
    setState({ status: 'connecting' })
    setTimeout(() => {
      socket = connect()
    }, 1000)
  }
  return next
}

function handle(message: Message) {
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
    for (const terminal of sessions.values()) terminal.reset()
  }
  sync(message.layout)
  if (message.type === 'active') {
    sessions.forEach((terminal, id) => {
      if (terminal.element.isConnected) reportSize(id, terminal)
    })
  }
  if (message.type === 'active') {
    setState({
      status: 'active',
      layout: message.layout,
      branches: message.branches,
    })
    return
  }
  setState({ status: 'active', layout: message.layout })
}

function sync(layout: Layout) {
  const ids = new Set(
    layout.groups.flatMap((group) => group.tabs.map((tab) => tab.id))
  )
  sessions.forEach((terminal, id) => {
    if (ids.has(id)) return
    terminal.dispose()
    sessions.delete(id)
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
  const terminal = new Terminal(terminalOptions(state.config), {
    onData: (data) => {
      if (!typedAt.has(id)) typedAt.set(id, performance.now())
      sendInput(id, applyCtrl(data))
    },
    onReply: (data) => sendInput(id, data),
    onResize: (cols, rows) => send({ type: 'resize', id, cols, rows }),
    onTitle: (title) => setState({ titles: { ...state.titles, [id]: title } }),
    onProgress: (progress) =>
      setState({ progress: { ...state.progress, [id]: progress } }),
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
      if (state.config.behavior.shiftEnterNewline && isShiftEnter(event)) {
        event.preventDefault()
        sendInput(id, '\x1b\r')
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
      pasteImages(terminal, images).catch((error: unknown) =>
        console.error('could not paste image', error)
      )
    },
    true
  )
  return terminal
}

async function pasteImages(terminal: Terminal, images: File[]) {
  const paths: string[] = []
  for (const image of images) {
    const response = await fetch('/api/paste', {
      method: 'POST',
      headers: { 'Content-Type': image.type },
      body: image,
    })
    if (!response.ok) throw new Error(await response.text())
    const path = (await response.json()) as string
    paths.push(/\s/.test(path) ? `"${path}"` : path)
  }
  terminal.paste(paths.join(' '))
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
  send({ type: 'resize', id, cols: terminal.cols, rows: terminal.rows })
}

function getSession(id: number) {
  const session = sessions.get(id)
  if (!session) throw new Error(`terminal ${id} does not exist`)
  return session
}

export function mount(id: number, container: HTMLElement) {
  const terminal = getSession(id)
  container.appendChild(terminal.element)
  terminal.fit()
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
    terminal.setOptions(terminalOptions(config))
}
