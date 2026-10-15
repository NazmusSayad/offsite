import type {
  Account,
  Activity,
  Capabilities,
  Config,
  ConfigInfo,
  Context,
  Decision,
  Delivery,
  Message,
  Prompt,
  PermissionRequest,
  Queued,
  ServerEvent,
  Session,
  SessionPatch,
  Settings,
} from '@server/protocol'
import { schemes } from '@server/schemes'
import { useSyncExternalStore } from 'react'
import { errorMessage } from '@/lib/utils'
import { call, isConnected, listen } from './connection'
import { notify, push } from './notifications'

export type Selection = { cwd: string; sessionId: string | null }

type State = {
  connected: boolean
  sessions: Session[]
  folders: string[]
  accounts: Account[]
  accountsOpen: boolean
  paletteOpen: boolean
  settingsOpen: boolean
  config: Config
  configError: string | null
  system: Omit<ConfigInfo, 'config'>
  activity: Record<string, Activity>
  unseen: string[]
  selection: Selection | null
  loaded: boolean
  messages: Message[]
  partial: string
  requests: PermissionRequest[]
  queue: Queued[]
  settings: Settings
  draft: string | null
  context: Context | null
  capabilities: Capabilities | null
  error: string | null
}

const listeners = new Set<() => void>()
let configWrites = 0
let configVersion = 0
let configTimer: number | undefined
let sessionWrites = 0
let sessionVersion = 0
let state: State

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getState() {
  return state
}

export function useStore<T>(select: (state: State) => T) {
  return useSyncExternalStore(subscribe, () => select(state))
}

export function selectedRunning(state: State) {
  const sessionId = state.selection?.sessionId ?? null
  return sessionId !== null && state.activity[sessionId]?.running === true
}

export function start(info: ConfigInfo) {
  const { config, ...system } = info
  const selection = selectionFromUrl()
  state = {
    connected: isConnected(),
    sessions: [],
    folders: [],
    accounts: [],
    accountsOpen: false,
    paletteOpen: false,
    settingsOpen: false,
    config,
    configError: null,
    system,
    activity: {},
    unseen: [],
    selection,
    loaded: selection?.sessionId === null,
    messages: [],
    partial: '',
    requests: [],
    queue: [],
    settings: config.composer,
    draft: null,
    context: null,
    capabilities: null,
    error: null,
  }
  applyTheme()
  listen({
    open: reopen,
    close: () => update({ connected: false }),
    event: receive,
  })
  reopen()
  void refreshSessions()
  void refreshAccounts()
  void refreshCapabilities()
  window.addEventListener('focus', () => void refreshSessions())
}

export function openSession(selection: Selection) {
  update({
    selection,
    loaded: selection.sessionId === null,
    messages: [],
    partial: '',
    requests: [],
    queue: [],
    settings: state.config.composer,
    context: null,
    paletteOpen: false,
    unseen: state.unseen.filter((id) => id !== selection.sessionId),
  })
  syncUrl()
  void refreshCapabilities()
  if (selection.sessionId !== null && isConnected())
    call('sessions.open', {
      cwd: selection.cwd,
      sessionId: selection.sessionId,
    }).catch(showError)
}

export function addFolder(cwd: string) {
  if (!state.folders.includes(cwd)) {
    const folders = [...state.folders, cwd]
    update({ folders })
    call('folders.save', folders).then(
      (saved) => update({ folders: saved }),
      showError
    )
  }
  openSession({ cwd, sessionId: null })
}

export async function sendPrompt(prompt: Prompt, delivery: Delivery) {
  const selection = state.selection
  if (selection === null) throw new Error('no session selected')
  if ('Notification' in window && Notification.permission === 'default')
    void Notification.requestPermission()
  await call('sessions.send', {
    sessionId: selection.sessionId,
    cwd: selection.cwd,
    prompt,
    settings: state.settings,
    delivery,
  })
}

export function unqueue(id: string) {
  const sessionId = state.selection?.sessionId
  if (sessionId === undefined || sessionId === null) return
  call('sessions.unqueue', { sessionId, id }).catch(showError)
}

export function interrupt() {
  const sessionId = state.selection?.sessionId
  if (sessionId === undefined || sessionId === null) return
  call('sessions.interrupt', { sessionId }).catch(showError)
}

export function changeSettings(patch: Partial<Settings>) {
  const settings = { ...state.settings, ...patch }
  update({ settings })
  updateConfig({ ...state.config, composer: settings })
  if (patch.accountId !== undefined) void refreshCapabilities()
  const sessionId = state.selection?.sessionId
  if (sessionId === undefined || sessionId === null) return
  if (state.activity[sessionId] !== undefined && patch.accountId === undefined)
    call('sessions.configure', { sessionId, settings }).catch(showError)
}

export function respond(
  requestId: string,
  decision: Decision,
  answers: Record<string, string> | null
) {
  const sessionId = state.selection?.sessionId
  if (sessionId === undefined || sessionId === null) return
  call('sessions.respond', { sessionId, requestId, decision, answers }).catch(
    showError
  )
}

export function setAccounts(accounts: Account[]) {
  update({ accounts })
  if (!accounts.some((item) => item.id === state.settings.accountId))
    changeSettings({ accountId: 'default' })
}

export function showAccounts(accountsOpen: boolean) {
  update({ accountsOpen, paletteOpen: false })
}

export async function forkFrom(messageId: string) {
  const selection = state.selection
  if (selection === null || selection.sessionId === null) return
  try {
    const result = await call('sessions.fork', {
      sessionId: selection.sessionId,
      cwd: selection.cwd,
      messageId,
    })
    await refreshSessions()
    openSession({ cwd: selection.cwd, sessionId: result.sessionId })
  } catch (error) {
    showError(error)
  }
}

export function setDraft(draft: string | null) {
  update({ draft })
}

export async function refreshSessions() {
  const version = sessionVersion
  try {
    const sessions = await call('sessions.list', undefined)
    if (sessionWrites === 0 && version === sessionVersion) update({ sessions })
  } catch (error) {
    showError(error)
  }
}

export function showPalette(paletteOpen: boolean) {
  update({ paletteOpen })
}

export function showSettings(settingsOpen: boolean) {
  update({ settingsOpen, paletteOpen: false })
}

export function updateConfig(config: Config) {
  update({ config })
  applyTheme()
  if (configTimer === undefined) configWrites += 1
  configVersion += 1
  window.clearTimeout(configTimer)
  configTimer = window.setTimeout(() => {
    configTimer = undefined
    void saveConfig(config)
  }, 300)
}

export async function editSession(id: string, patch: SessionPatch) {
  update({
    sessions: state.sessions.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    ),
  })
  await saveSessions(() => call('sessions.update', { id, patch }))
}

export async function removeSession(id: string) {
  update({ sessions: state.sessions.filter((item) => item.id !== id) })
  const selection = state.selection
  if (selection?.sessionId === id)
    openSession({ cwd: selection.cwd, sessionId: null })
  await saveSessions(() => call('sessions.remove', { id }))
}

export function showError(error: unknown) {
  update({ error: errorMessage(error) })
}

export function dismissError() {
  update({ error: null })
}

function reopen() {
  update({ connected: true })
  const selection = state.selection
  if (selection !== null && selection.sessionId !== null)
    call('sessions.open', {
      cwd: selection.cwd,
      sessionId: selection.sessionId,
    }).catch(showError)
}

function receive(event: ServerEvent) {
  const current = state.selection?.sessionId ?? null
  switch (event.type) {
    case 'activity': {
      const running =
        current !== null && event.activity[current]?.running === true
      const finished = Object.keys(state.activity).filter(
        (id) =>
          state.activity[id].running && event.activity[id]?.running !== true
      )
      const waiting = Object.keys(event.activity).filter(
        (id) =>
          event.activity[id].waiting && state.activity[id]?.waiting !== true
      )
      notify(finished, 'finished')
      notify(waiting, 'needs your input')
      update({
        activity: event.activity,
        partial: running ? state.partial : '',
        unseen: [
          ...state.unseen,
          ...finished.filter(
            (id) => id !== current && !state.unseen.includes(id)
          ),
        ],
      })
      void refreshSessions()
      return
    }
    case 'limits':
      update({
        accounts: state.accounts.map((item) =>
          item.id === event.accountId ? { ...item, limits: event.limits } : item
        ),
      })
      return
    case 'config':
      if (configWrites === 0) applyConfig(event.config)
      return
    case 'folders':
      update({ folders: event.folders })
      return
    case 'started':
      if (
        state.selection === null ||
        state.selection.cwd !== event.cwd ||
        state.selection.sessionId !== null
      )
        return
      update({
        selection: { cwd: event.cwd, sessionId: event.sessionId },
        loaded: true,
        messages: [],
        partial: '',
        requests: [],
        queue: [],
      })
      syncUrl()
      return
    case 'notification':
      push(event.sessionId, event.message)
      return
  }
  if (event.sessionId !== current) return
  switch (event.type) {
    case 'history':
      update({
        loaded: true,
        messages: event.messages,
        requests: event.requests,
        queue: event.queue,
        settings: event.settings ?? state.settings,
        context: event.context,
        partial: '',
      })
      return
    case 'context':
      update({ context: event.context })
      return
    case 'message':
      if (state.messages.some((item) => item.uuid === event.message.uuid))
        return
      update({
        messages: [...state.messages, event.message],
        partial: event.message.type === 'assistant' ? '' : state.partial,
      })
      return
    case 'delta':
      update({ partial: state.partial + event.text })
      return
    case 'request':
      update({ requests: [...state.requests, event.request] })
      return
    case 'requestDone':
      update({
        requests: state.requests.filter((item) => item.id !== event.requestId),
      })
      return
    case 'queue':
      update({ queue: event.queue })
      return
    case 'settings':
      update({
        settings: { ...event.settings, accountId: state.settings.accountId },
      })
  }
}

async function refreshAccounts() {
  try {
    setAccounts(await call('accounts.list', undefined))
  } catch (error) {
    showError(error)
  }
}

async function refreshCapabilities() {
  const cwd = state.selection?.cwd
  if (cwd === undefined) return
  const accountId = state.settings.accountId
  try {
    const capabilities = await call('capabilities', { accountId, cwd })
    if (state.selection?.cwd === cwd && state.settings.accountId === accountId)
      update({ capabilities })
  } catch (error) {
    showError(error)
  }
}

async function saveSessions(write: () => Promise<Session[]>) {
  sessionWrites += 1
  sessionVersion += 1
  let sessions: Session[] | null = null
  try {
    sessions = await write()
  } catch (error) {
    showError(error)
  }
  sessionWrites -= 1
  if (sessionWrites > 0) return
  if (sessions === null) await refreshSessions()
  else update({ sessions })
}

async function saveConfig(config: Config) {
  let saved: Config | null = null
  try {
    saved = await call('config.save', config)
    update({ configError: null })
  } catch (error) {
    update({
      configError: errorMessage(error),
    })
  }
  configWrites -= 1
  if (configWrites > 0) return
  if (saved === null) await refreshConfig()
  else applyConfig(saved)
}

async function refreshConfig() {
  const version = configVersion
  try {
    const info = await call('config.get', undefined)
    if (configWrites === 0 && version === configVersion)
      applyConfig(info.config)
  } catch (error) {
    showError(error)
  }
}

function applyConfig(config: Config) {
  const sessionId = state.selection?.sessionId ?? null
  const live = sessionId !== null && state.activity[sessionId] !== undefined
  const accountChanged =
    !live && config.composer.accountId !== state.settings.accountId
  update({
    config,
    ...(live ? {} : { settings: config.composer }),
  })
  applyTheme()
  if (accountChanged) void refreshCapabilities()
}

function update(patch: Partial<State>) {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export function currentScheme() {
  const scheme = schemes.find((item) => item.id === state.config.theme)
  if (scheme === undefined)
    throw new Error(`unknown theme ${state.config.theme}`)
  return scheme
}

function applyTheme() {
  const scheme = currentScheme()
  const style = document.documentElement.style
  style.setProperty('--bg', scheme.background)
  style.setProperty('--text', scheme.foreground)
  style.setProperty('--brand', scheme.palette[4])
  style.setProperty('--danger', scheme.palette[1])
  style.setProperty('--green', scheme.palette[2])
  style.setProperty('--yellow', scheme.palette[3])
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', scheme.background)
}

function selectionFromUrl(): Selection | null {
  const params = new URLSearchParams(location.search)
  const cwd = params.get('cwd')
  if (cwd === null) return null
  return { cwd, sessionId: params.get('session') }
}

function syncUrl() {
  const selection = state.selection
  const params = new URLSearchParams()
  if (selection !== null) {
    params.set('cwd', selection.cwd)
    if (selection.sessionId !== null) params.set('session', selection.sessionId)
  }
  const search = params.toString()
  history.replaceState(null, '', search === '' ? '/' : `/?${search}`)
}
