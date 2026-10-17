import {
  FRAME_INPUT,
  FRAME_REPLAY,
  FRAME_REPLY,
  type TerminalEvent,
  type TerminalLayout,
  type TerminalRequest,
  type TerminalTab,
} from '@offsite/core/protocol'
import { call, isConnected, listen, sendFrame } from '@/api/connection'
import { loadGhostty } from '@/lib/ghostty/runtime'
import {
  type FindResults,
  type Progress,
  Terminal,
} from '@/lib/ghostty/terminal'
import { openSession } from '@/lib/sessions'
import {
  getState as appState,
  machineOf,
  subscribe as subscribeApp,
} from '@/lib/store'
import { errorMessage, isMac } from '@/lib/utils'
import {
  beep,
  forgetTab,
  isSeen,
  noteMessage,
  noteOutput,
  notifyFromProgram,
  ringBell,
  syncQuietTimers,
  unseenAttention,
} from './attention'
import {
  imagePasteKeys,
  isImagePasteKey,
  pasteClipboardImages,
  pasteImages,
  readClipboard,
  reportPasteError,
  writeClipboard,
} from './clipboard'
import { applyStyle, terminalOptions } from './config'

type State = {
  status: 'connecting' | 'active'
  failure: string | null
  loaded: boolean
  open: boolean
  instance: string | null
  layout: TerminalLayout
  ctrl: boolean
  titles: Record<number, string>
  progress: Record<number, Progress>
  alerts: number[]
  finding: number | null
  quiet: number[]
}

function emptyTabState() {
  return { titles: {}, progress: {}, alerts: [], finding: null, quiet: [] }
}

const encoder = new TextEncoder()
const sessions = new Map<number, Terminal>()
const awaitingReplay = new Set<number>()
const listeners = new Set<() => void>()
let state: State = {
  status: 'connecting',
  failure: null,
  loaded: false,
  open: false,
  instance: null,
  layout: {},
  ctrl: false,
  ...emptyTabState(),
}
let mounted: number | null = null
let machine: string | null = null
let attached = false

export async function startTerminal() {
  try {
    await Promise.all([loadGhostty(), applyStyle(terminalConfig())])
    setState({ loaded: true })
  } catch (error) {
    console.error('could not start the terminal', error)
    setState({
      failure: errorMessage(error),
    })
    return
  }
  listen({
    close: (origin) => {
      if (origin === machine) setState({ status: 'connecting' })
    },
    terminal: (origin, event) => {
      if (origin !== machine) return
      handle(event)
      noteMessage()
    },
    frame: (origin, frame) => {
      if (origin === machine) receiveFrame(frame)
    },
  })
  followSelection()
  document.addEventListener('visibilitychange', () => setState({}))
  window.addEventListener('focus', () => {
    setState({})
    if (mounted !== null) reportSize(mounted, getSession(mounted))
  })
  window.addEventListener('blur', () => setState({}))
  if ('serviceWorker' in navigator)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type !== 'select') return
      showTab(event.data.machine, event.data.project, event.data.tabId)
    })
  let previous = appState().prefs
  let previousIdentity = identity()
  subscribeApp(() => {
    followSelection()
    const next = appState().prefs
    const nextIdentity = identity()
    const changed =
      next.theme !== previous.theme ||
      next.terminal !== previous.terminal ||
      nextIdentity !== previousIdentity
    previous = next
    previousIdentity = nextIdentity
    if (changed) void applyConfig()
  })
  selectLinkedTab()
}

function followSelection() {
  const target = appState().selection?.machine ?? null
  if (target !== machine) {
    if (machine !== null && attached) send({ type: 'detach' })
    sync({})
    awaitingReplay.clear()
    machine = target
    attached = false
    setState({
      status: 'connecting',
      instance: null,
      layout: {},
      ...emptyTabState(),
    })
  }
  if (machine === null) return
  const online = machineOf(appState(), machine).status === 'online'
  if (online && !attached) {
    attached = true
    send({ type: 'attach' })
  }
  if (!online) attached = false
}

function identity() {
  if (machine === null) return null
  return (
    machineOf(appState(), machine).config?.terminal.behavior.terminalIdentity ??
    null
  )
}

function currentOptions() {
  if (machine === null) throw new Error('the terminal has no machine')
  const target = machineOf(appState(), machine)
  if (target.config === null || target.system === null)
    throw new Error(`${target.name} is not connected`)
  return terminalOptions(
    terminalConfig(),
    target.config.terminal.behavior.terminalIdentity
  )
}

export function terminalMachine() {
  if (machine === null) throw new Error('the terminal has no machine')
  return machine
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
  syncQuietTimers()
  for (const listener of listeners) listener()
}

export function terminalConfig() {
  return appState().prefs.terminal
}

export function currentProject() {
  const projectId = appState().selection?.projectId
  if (projectId === undefined) return null
  return { projectId, project: state.layout[projectId] ?? null }
}

export function findProject(id: number) {
  for (const [projectId, project] of Object.entries(state.layout))
    if (project.tabs.some((tab) => tab.id === id)) return { projectId, project }
  return null
}

export function tabTitle(tab: TerminalTab) {
  return (tab.customName ?? state.titles[tab.id]) || 'Terminal'
}

export function setOpen(open: boolean) {
  setState({ open })
}

function showTab(target: string, projectId: string, tabId: number) {
  const selection = appState().selection
  if (selection?.machine !== target || selection.projectId !== projectId)
    openSession({ machine: target, projectId, sessionId: null })
  setState({ open: true })
  send({ type: 'select', projectId, tabId })
}

export function send(request: TerminalRequest) {
  if (machine === null || !isConnected(machine)) return
  call(machine, 'terminal', request).catch((error: unknown) =>
    console.error('terminal request failed', error)
  )
}

export function sendInput(id: number, data: string | Uint8Array) {
  if (machine === null) return
  sendFrame(
    machine,
    FRAME_INPUT,
    id,
    typeof data === 'string' ? encoder.encode(data) : data
  )
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

function receiveFrame(frame: { kind: number; id: number; data: Uint8Array }) {
  const terminal = sessions.get(frame.id)
  if (!terminal) return
  const replay = frame.kind === FRAME_REPLAY
  const awaited = replay && awaitingReplay.delete(frame.id)
  if (awaited) terminal.reset()
  terminal.write(frame.data, replay)
  if (awaited && awaitingReplay.size === 0) setState({ status: 'active' })
  if (!replay) noteOutput(frame.id)
  noteMessage()
}

function handle(message: TerminalEvent) {
  const restarted =
    message.type === 'active' && message.instance !== state.instance
  if (restarted) sync({})
  sync(message.layout)
  if (message.type === 'active') {
    awaitingReplay.clear()
    sessions.forEach((terminal, id) => {
      awaitingReplay.add(id)
      if (terminal.element.isConnected) reportSize(id, terminal)
    })
    setState({
      ...(restarted && {
        instance: message.instance,
        ...emptyTabState(),
      }),
      status: awaitingReplay.size === 0 ? 'active' : 'connecting',
      layout: message.layout,
    })
    return
  }
  for (const id of awaitingReplay)
    if (!sessions.has(id)) awaitingReplay.delete(id)
  const projectId = appState().selection?.projectId
  const closedLastTab =
    projectId !== undefined &&
    (state.layout[projectId]?.tabs.length ?? 0) > 0 &&
    message.layout[projectId]?.tabs.length === 0
  setState({
    status: awaitingReplay.size === 0 ? 'active' : 'connecting',
    layout: message.layout,
    ...(closedLastTab && { open: false }),
  })
}

function sync(layout: TerminalLayout) {
  const ids = new Set(
    Object.values(layout).flatMap((project) =>
      project.tabs.map((tab) => tab.id)
    )
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
  const terminal = new Terminal(currentOptions(), {
    onData: (data) => {
      if (state.status !== 'active') return
      sendInput(id, applyCtrl(data))
    },
    onReply: (data) => {
      if (data === '\x1b[I' || data === '\x1b[O') sendInput(id, data)
      else if (machine !== null)
        sendFrame(machine, FRAME_REPLY, id, encoder.encode(data))
    },
    onResize: (cols, rows) => send({ type: 'resize', id, cols, rows }),
    onTitle: (title) => setState({ titles: { ...state.titles, [id]: title } }),
    onProgress: (progress) =>
      setState({ progress: { ...state.progress, [id]: progress } }),
    onBell: () => {
      const behavior = terminalConfig().behavior
      if (behavior.bellSound) beep()
      if (
        behavior.bellFlash &&
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
    onClipboard: writeClipboard,
    onClipboardRead: (query) => {
      if (!isSeen(id)) return
      void readClipboard((text) => terminal.replyClipboard(text, query))
    },
    onLink: (uri) => window.open(uri, '_blank', 'noopener'),
    beforeKey: (event) => {
      if (event.type !== 'keydown') return true
      const config = terminalConfig()
      const system = machineOf(appState(), terminalMachine()).system
      if (system === null)
        throw new Error('the terminal machine is not connected')
      const platform = system.platform
      if (
        state.status === 'active' &&
        config.behavior.modernizeShiftEnter &&
        isShiftEnter(event) &&
        !terminal.isKittyKeyboard()
      ) {
        event.preventDefault()
        terminal.beforeInput('\x1b\r')
        sendInput(id, '\x1b\r')
        return false
      }
      if (
        state.status === 'active' &&
        config.behavior.pasteBrowserImages &&
        window.isSecureContext &&
        isImagePasteKey(event, platform)
      ) {
        event.preventDefault()
        const data = imagePasteKeys[platform].data
        terminal.beforeInput(data)
        pasteClipboardImages(terminalMachine(), terminal)
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
      pasteImages(terminalMachine(), terminal, images).catch(reportPasteError)
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
  send({ type: 'resize', id, cols: terminal.cols, rows: terminal.rows })
}

export function getSession(id: number) {
  const session = sessions.get(id)
  if (!session) throw new Error(`terminal ${id} does not exist`)
  return session
}

export function mount(id: number, container: HTMLElement) {
  const terminal = getSession(id)
  container.append(terminal.element)
  terminal.fit()
  for (const other of sessions.values())
    other.presize(terminal.cols, terminal.rows)
  mounted = id
  reportSize(id, terminal)
  terminal.focus()
  return () => {
    terminal.element.remove()
    if (mounted === id) mounted = null
  }
}

async function applyConfig() {
  await applyStyle(terminalConfig())
  if (sessions.size > 0) {
    const options = currentOptions()
    for (const terminal of sessions.values()) terminal.setOptions(options)
  }
  setState({})
}

function selectLinkedTab() {
  const params = new URLSearchParams(location.search)
  const target = params.get('machine')
  const projectId = params.get('project')
  const tabId = params.get('terminal')
  if (target === null || projectId === null || tabId === null) return
  params.delete('terminal')
  history.replaceState(null, '', `/?${params}`)
  const unsubscribe = subscribe(() => {
    if (state.status !== 'active' || machine !== target) return
    unsubscribe()
    showTab(target, projectId, Number(tabId))
  })
}
