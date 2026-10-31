import {
  FRAME_INPUT,
  FRAME_REPLAY,
  FRAME_REPLY,
  GLOBAL_TERMINALS,
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
import {
  currentSearch,
  leaveLayer,
  replaceSearch,
  terminalPage,
  terminalView,
} from '@/lib/url'
import { errorMessage, isMac } from '@/lib/utils'
import { forgetTab, unseenAttention } from './attention'
import { applyStyle, terminalOptions } from './config'
import { createSession } from './create-session'
import { keepPageOpen, showGroup } from './page'

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
}

function emptyTabState() {
  return { titles: {}, progress: {}, alerts: [], finding: null }
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
  layout: { tabs: [], active: {} },
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
    },
    frame: (origin, frame) => {
      if (origin === machine) {
        receiveFrame(frame)
      }
    },
  })
  followSelection()
  router.history.subscribe(followSelection)
  router.history.subscribe(keepPageOpen)
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
  const target = terminalPage() ?? appState().selection?.machine ?? null
  if (target !== machine) {
    if (machine !== null && attached) {
      send({ type: 'detach' })
    }
    sync([])
    awaitingReplay.clear()
    machine = target
    attached = false
    setState({
      status: 'connecting',
      instance: null,
      layout: { tabs: [], active: {} },
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
  for (const listener of listeners) {
    listener()
  }
}

export function terminalConfig() {
  return appState().prefs.terminal
}

export function currentView() {
  const view =
    terminalPage() === null ? appState().selection?.projectId : terminalView()
  if (view === undefined) {
    return null
  }
  return {
    view,
    tabs: viewTabs(state.layout, view),
    tabId: state.layout.active[view] ?? null,
  }
}

export function viewTabs(layout: TerminalLayout, view: string) {
  return layout.tabs.filter((tab) => tabView(tab) === view)
}

export function tabView(tab: TerminalTab) {
  return tab.projectId ?? GLOBAL_TERMINALS
}

export function findTab(id: number) {
  return state.layout.tabs.find((tab) => tab.id === id)
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
  const open = currentSearch().bottom === 'terminal' || terminalPage() !== null
  if (open !== state.open) {
    setState({ open })
  }
}

function showTab(target: string, projectId: string, tabId: number) {
  if (projectId === GLOBAL_TERMINALS) {
    showGroup(target, GLOBAL_TERMINALS)
  } else {
    const selection = appState().selection
    if (selection?.machine !== target || selection.projectId !== projectId) {
      openSession({ machine: target, projectId, sessionId: null })
    }
    setOpen(true)
  }
  sendTo(target, { type: 'select', view: projectId, tabId })
}

export function send(request: TerminalRequest) {
  if (machine === null) {
    return
  }
  sendTo(machine, request)
}

export function sendTo(target: string, request: TerminalRequest) {
  if (!isConnected(target)) {
    return
  }
  call(target, 'terminal', request).catch((error: unknown) =>
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
}

function handle(message: TerminalEvent) {
  const restarted =
    message.type === 'active' && message.instance !== state.instance
  if (restarted) {
    sync([])
  }
  sync(message.layout.tabs)
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
    keepPageOpen()
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
    viewTabs(state.layout, projectId).length > 0 &&
    viewTabs(message.layout, projectId).length === 0
  setState({
    status: awaitingReplay.size === 0 ? 'active' : 'connecting',
    layout: message.layout,
  })
  if (closedLastTab && state.open) {
    setOpen(false)
  }
  keepPageOpen()
}

function sync(tabs: TerminalTab[]) {
  const ids = new Set(tabs.map((tab) => tab.id))
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
  const page = terminalPage()
  const target = page ?? search.machine
  const projectId = page === null ? search.project : GLOBAL_TERMINALS
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
