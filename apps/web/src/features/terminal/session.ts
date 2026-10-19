import {
  FRAME_INPUT,
  FRAME_REPLAY,
  FRAME_REPLY,
  type TerminalEvent,
  type TerminalLayout,
  type TerminalRequest,
  type TerminalTab,
} from '@offsite/core/terminal'
import { call, isConnected, listen, sendFrame } from '@/api/connection'
import { loadGhostty } from '@/lib/ghostty/runtime'
import {
  type FindResults,
  type Progress,
  Terminal,
} from '@/lib/ghostty/terminal'
import { router } from '@/lib/router'
import { openSession } from '@/lib/sessions'
import {
  getState as appState,
  machineOf,
  subscribe as subscribeApp,
} from '@/lib/store'
import { currentSearch, leaveLayer, replaceSearch } from '@/lib/url'
import { errorMessage, isMac } from '@/lib/utils'
import {
  forgetTab,
  noteMessage,
  noteOutput,
  syncQuietTimers,
  unseenAttention,
} from './attention'
import { applyStyle, terminalOptions } from './config'
import { createSession } from './create-session'

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
  followUrl()
  router.history.subscribe(followUrl)
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
      if (origin === machine) {
        setState({ status: 'connecting' })
      }
    },
    terminal: (origin, event) => {
      if (origin !== machine) {
        return
      }
      handle(event)
      noteMessage()
    },
    frame: (origin, frame) => {
      if (origin === machine) {
        receiveFrame(frame)
      }
    },
  })
  followSelection()
  document.addEventListener('visibilitychange', () => setState({}))
  window.addEventListener('focus', () => {
    setState({})
    if (mounted !== null) {
      reportSize(mounted, getSession(mounted))
    }
  })
  window.addEventListener('blur', () => setState({}))
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type !== 'select') {
        return
      }
      showTab(event.data.machine, event.data.project, event.data.tabId)
    })
  }
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
    if (changed) {
      void applyConfig()
    }
  })
  selectLinkedTab()
}

function followSelection() {
  const target = appState().selection?.machine ?? null
  if (target !== machine) {
    if (machine !== null && attached) {
      send({ type: 'detach' })
    }
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
  if (machine === null) {
    return
  }
  const online = machineOf(appState(), machine).status === 'online'
  if (online && !attached) {
    attached = true
    send({ type: 'attach' })
  }
  if (!online) {
    attached = false
  }
}

function identity() {
  if (machine === null) {
    return null
  }
  return (
    machineOf(appState(), machine).config?.terminal.behavior.terminalIdentity ??
    null
  )
}

export function currentOptions() {
  if (machine === null) {
    throw new Error('the terminal has no machine')
  }
  const target = machineOf(appState(), machine)
  if (target.config === null || target.system === null) {
    throw new Error(`${target.name} is not connected`)
  }
  return terminalOptions(
    terminalConfig(),
    target.config.terminal.behavior.terminalIdentity
  )
}

export function terminalMachine() {
  if (machine === null) {
    throw new Error('the terminal has no machine')
  }
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
  for (const listener of listeners) {
    listener()
  }
}

export function terminalConfig() {
  return appState().prefs.terminal
}

export function currentProject() {
  const projectId = appState().selection?.projectId
  if (projectId === undefined) {
    return null
  }
  return { projectId, project: state.layout[projectId] ?? null }
}

export function findProject(id: number) {
  for (const [projectId, project] of Object.entries(state.layout)) {
    if (project.tabs.some((tab) => tab.id === id)) {
      return { projectId, project }
    }
  }
  return null
}

export function tabTitle(tab: TerminalTab) {
  return (tab.customName ?? state.titles[tab.id]) || 'Terminal'
}

export function setOpen(open: boolean) {
  if (open) {
    replaceSearch({ bottom: 'terminal' })
    return
  }
  leaveLayer('overlay', () => replaceSearch({ bottom: undefined }))
}

function followUrl() {
  const open = currentSearch().bottom === 'terminal'
  if (open !== state.open) {
    setState({ open })
  }
}

function showTab(target: string, projectId: string, tabId: number) {
  const selection = appState().selection
  if (selection?.machine !== target || selection.projectId !== projectId) {
    openSession({ machine: target, projectId, sessionId: null })
  }
  setOpen(true)
  send({ type: 'select', projectId, tabId })
}

export function send(request: TerminalRequest) {
  if (machine === null || !isConnected(machine)) {
    return
  }
  call(machine, 'terminal', request).catch((error: unknown) =>
    console.error('terminal request failed', error)
  )
}

export function sendInput(id: number, data: string | Uint8Array) {
  if (machine === null) {
    return
  }
  sendFrame(
    machine,
    FRAME_INPUT,
    id,
    typeof data === 'string' ? encoder.encode(data) : data
  )
}

export function sendReply(id: number, data: string) {
  if (machine === null) {
    return
  }
  sendFrame(machine, FRAME_REPLY, id, encoder.encode(data))
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
  if (!terminal) {
    return
  }
  const replay = frame.kind === FRAME_REPLAY
  const awaited = replay && awaitingReplay.delete(frame.id)
  if (awaited) {
    terminal.reset()
  }
  terminal.write(frame.data, replay)
  if (awaited && awaitingReplay.size === 0) {
    setState({ status: 'active' })
  }
  if (!replay) {
    noteOutput(frame.id)
  }
  noteMessage()
}

function handle(message: TerminalEvent) {
  const restarted =
    message.type === 'active' && message.instance !== state.instance
  if (restarted) {
    sync({})
  }
  sync(message.layout)
  if (message.type === 'active') {
    awaitingReplay.clear()
    sessions.forEach((terminal, id) => {
      awaitingReplay.add(id)
      if (terminal.element.isConnected) {
        reportSize(id, terminal)
      }
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
  for (const id of awaitingReplay) {
    if (!sessions.has(id)) {
      awaitingReplay.delete(id)
    }
  }
  const projectId = appState().selection?.projectId
  const closedLastTab =
    projectId !== undefined &&
    (state.layout[projectId]?.tabs.length ?? 0) > 0 &&
    message.layout[projectId]?.tabs.length === 0
  setState({
    status: awaitingReplay.size === 0 ? 'active' : 'connecting',
    layout: message.layout,
  })
  if (closedLastTab && state.open) {
    setOpen(false)
  }
}

function sync(layout: TerminalLayout) {
  const ids = new Set(
    Object.values(layout).flatMap((project) =>
      project.tabs.map((tab) => tab.id)
    )
  )
  sessions.forEach((terminal, id) => {
    if (ids.has(id)) {
      return
    }
    terminal.dispose()
    sessions.delete(id)
    forgetTab(id)
  })
  for (const id of ids) {
    if (!sessions.has(id)) {
      sessions.set(id, createSession(id))
    }
  }
}

export function isFindShortcut(event: KeyboardEvent) {
  if (event.key.toLowerCase() !== 'f') {
    return false
  }
  if (isMac) {
    return event.metaKey && !event.ctrlKey && !event.altKey
  }
  return event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey
}

function reportSize(id: number, terminal: Terminal) {
  send({ type: 'resize', id, cols: terminal.cols, rows: terminal.rows })
}

export function getSession(id: number) {
  const session = sessions.get(id)
  if (!session) {
    throw new Error(`terminal ${id} does not exist`)
  }
  return session
}

export function mount(id: number, container: HTMLElement) {
  const terminal = getSession(id)
  container.append(terminal.element)
  terminal.fit()
  for (const other of sessions.values()) {
    other.presize(terminal.cols, terminal.rows)
  }
  mounted = id
  reportSize(id, terminal)
  terminal.focus()
  return () => {
    terminal.element.remove()
    if (mounted === id) {
      mounted = null
    }
  }
}

async function applyConfig() {
  await applyStyle(terminalConfig())
  if (sessions.size > 0) {
    const options = currentOptions()
    for (const terminal of sessions.values()) {
      terminal.setOptions(options)
    }
  }
  setState({})
}

function selectLinkedTab() {
  const search = currentSearch()
  const target = search.machine
  const projectId = search.project
  const tabId = search.terminal
  if (target === undefined || projectId === undefined || tabId === undefined) {
    return
  }
  replaceSearch({ terminal: undefined })
  const unsubscribe = subscribe(() => {
    if (state.status !== 'active' || machine !== target) {
      return
    }
    unsubscribe()
    showTab(target, projectId, Number(tabId))
  })
}
