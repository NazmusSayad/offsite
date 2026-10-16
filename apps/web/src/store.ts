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
  Project,
  Prompt,
  PermissionRequest,
  Queued,
  Session,
  SessionPatch,
  Settings,
} from '@server/protocol'
import { createStore, type StoreApi, useStore as useZustand } from 'zustand'
import {
  deleteDraft,
  getDraftSettings,
  saveDraftSettings,
} from '@/composer/drafts'
import { errorMessage } from '@/lib/utils'
import { call, isConnected } from './connection'
import { applyTheme } from './theme'
import { syncUrl } from './url'

export type Selection = { cwd: string; sessionId: string | null }

export type SettingsPage =
  | 'General'
  | 'Terminal'
  | 'Notifications'
  | 'Accounts'
  | 'Shortcuts'

export type State = {
  connected: boolean
  sessions: Session[]
  projects: Project[]
  accounts: Account[]
  paletteOpen: boolean
  settingsOpen: boolean
  settingsPage: SettingsPage
  config: Config
  configError: string | null
  system: Omit<ConfigInfo, 'config'>
  activity: Record<string, Activity>
  unseen: string[]
  selection: Selection | null
  loaded: boolean
  messages: Message[]
  earlier: Message[]
  before: number | null
  partial: string
  requests: PermissionRequest[]
  queue: Queued[]
  settings: Settings
  draft: string | null
  context: Context | null
  capabilities: Capabilities | null
  error: string | null
}

let configWrites = 0
let configVersion = 0
let configTimer: number | undefined
let store: StoreApi<State>

export function createAppStore(initial: State) {
  store = createStore<State>()(() => initial)
}

export function subscribe(listener: () => void) {
  return store.subscribe(listener)
}

export function getState() {
  return store.getState()
}

export function useStore<T>(select: (state: State) => T) {
  return useZustand(store, select)
}

export function update(patch: Partial<State>) {
  store.setState(patch)
}

export function selectedRunning(state: State) {
  const sessionId = state.selection?.sessionId ?? null
  return sessionId !== null && state.activity[sessionId]?.running === true
}

export function openSession(selection: Selection) {
  update({
    selection,
    loaded: selection.sessionId === null,
    messages: [],
    earlier: [],
    before: null,
    partial: '',
    requests: [],
    queue: [],
    settings:
      getDraftSettings(selection.sessionId ?? selection.cwd) ??
      getState().config.composer,
    context: null,
    paletteOpen: false,
    unseen: getState().unseen.filter((id) => id !== selection.sessionId),
  })
  syncUrl()
  void refreshCapabilities()
  if (selection.sessionId !== null && isConnected())
    call('sessions.open', {
      cwd: selection.cwd,
      sessionId: selection.sessionId,
    }).catch(showError)
}

export async function sendPrompt(prompt: Prompt, delivery: Delivery) {
  const selection = getState().selection
  if (selection === null) throw new Error('no session selected')
  if ('Notification' in window && Notification.permission === 'default')
    void Notification.requestPermission()
  await call('sessions.send', {
    sessionId: selection.sessionId,
    cwd: selection.cwd,
    prompt,
    settings: getState().settings,
    delivery,
  })
}

export function unqueue(id: string) {
  const sessionId = getState().selection?.sessionId
  if (sessionId === undefined || sessionId === null) return
  call('sessions.unqueue', { sessionId, id }).catch(showError)
}

export function interrupt() {
  const sessionId = getState().selection?.sessionId
  if (sessionId === undefined || sessionId === null) return
  call('sessions.interrupt', { sessionId }).catch(showError)
}

export function changeSettings(patch: Partial<Settings>) {
  const settings = { ...getState().settings, ...patch }
  update({ settings })
  const selection = getState().selection
  if (selection !== null)
    saveDraftSettings(selection.sessionId ?? selection.cwd, settings)
  updateConfig({ ...getState().config, composer: settings })
  if (patch.accountId !== undefined) void refreshCapabilities()
  const sessionId = getState().selection?.sessionId
  if (sessionId === undefined || sessionId === null) return
  if (
    getState().activity[sessionId] !== undefined &&
    patch.accountId === undefined
  )
    call('sessions.configure', { sessionId, settings }).catch(showError)
}

export function respond(
  requestId: string,
  decision: Decision,
  answers: Record<string, string> | null
) {
  const sessionId = getState().selection?.sessionId
  if (sessionId === undefined || sessionId === null) return
  call('sessions.respond', { sessionId, requestId, decision, answers }).catch(
    showError
  )
}

export function setAccounts(accounts: Account[]) {
  update({ accounts })
  if (accounts.some((item) => item.id === getState().settings.accountId)) return
  if (accounts.length > 0) changeSettings({ accountId: accounts[0].id })
  else if (getState().settings.accountId !== null)
    changeSettings({ accountId: null })
}

export async function forkFrom(messageId: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) return
  try {
    const result = await call('sessions.fork', {
      sessionId: selection.sessionId,
      cwd: selection.cwd,
      messageId,
    })
    openSession({ cwd: selection.cwd, sessionId: result.sessionId })
  } catch (error) {
    showError(error)
  }
}

export async function loadEarlier() {
  const selection = getState().selection
  const before = getState().before
  if (selection === null || selection.sessionId === null || before === null)
    return
  try {
    const result = await call('sessions.earlier', {
      sessionId: selection.sessionId,
      before,
    })
    if (getState().selection !== selection || getState().before !== before)
      return
    update({
      earlier: [...result.messages, ...getState().earlier],
      before: result.before,
    })
  } catch (error) {
    showError(error)
  }
}

export async function loadAgent(parent: string, agentId: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) return
  try {
    const loaded = await call('sessions.agent', {
      sessionId: selection.sessionId,
      cwd: selection.cwd,
      agentId,
      parent,
    })
    if (getState().selection !== selection) return
    const uuids = new Set(loaded.map((item) => item.uuid))
    const messages = getState().messages
    update({
      messages: [
        ...messages.filter(
          (item) => item.type === 'notice' || item.parent !== parent
        ),
        ...loaded,
        ...messages.filter(
          (item) =>
            item.type !== 'notice' &&
            item.parent === parent &&
            !uuids.has(item.uuid)
        ),
      ],
    })
  } catch (error) {
    showError(error)
  }
}

export function setDraft(draft: string | null) {
  update({ draft })
}

export function showPalette(paletteOpen: boolean) {
  update({ paletteOpen })
}

export function showSettings(settingsOpen: boolean) {
  update({ settingsOpen, paletteOpen: false })
}

export function showSettingsPage(settingsPage: SettingsPage) {
  update({ settingsOpen: true, settingsPage, paletteOpen: false })
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
    sessions: getState().sessions.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    ),
  })
  try {
    await call('sessions.update', { id, patch })
  } catch (error) {
    showError(error)
  }
}

export async function removeSession(id: string) {
  update({ sessions: getState().sessions.filter((item) => item.id !== id) })
  deleteDraft(id)
  const selection = getState().selection
  if (selection?.sessionId === id)
    openSession({ cwd: selection.cwd, sessionId: null })
  try {
    await call('sessions.remove', { id })
  } catch (error) {
    showError(error)
  }
}

export function showError(error: unknown) {
  update({ error: errorMessage(error) })
}

export function dismissError() {
  update({ error: null })
}

export async function refreshAccounts() {
  try {
    setAccounts(await call('accounts.list', undefined))
  } catch (error) {
    showError(error)
  }
}

export async function refreshCapabilities() {
  const cwd = getState().selection?.cwd
  if (cwd === undefined) return
  const accountId = getState().settings.accountId
  if (accountId === null) {
    update({ capabilities: null })
    return
  }
  try {
    const capabilities = await call('capabilities', { accountId, cwd })
    if (
      getState().selection?.cwd === cwd &&
      getState().settings.accountId === accountId
    )
      update({ capabilities })
  } catch (error) {
    showError(error)
  }
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

export function receiveConfig(config: Config) {
  if (configWrites === 0) applyConfig(config)
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
  const selection = getState().selection
  const sessionId = selection?.sessionId ?? null
  const live =
    sessionId !== null && getState().activity[sessionId] !== undefined
  const settings =
    (selection === null
      ? null
      : getDraftSettings(selection.sessionId ?? selection.cwd)) ??
    config.composer
  const accountChanged =
    !live && settings.accountId !== getState().settings.accountId
  update({
    config,
    ...(live ? {} : { settings }),
  })
  applyTheme()
  if (accountChanged) void refreshCapabilities()
}
