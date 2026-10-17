import type {
  Account,
  Activity,
  Capabilities,
  Config,
  ConfigInfo,
  Context,
  Decision,
  Delivery,
  Item,
  Project,
  Prompt,
  PermissionRequest,
  Provider,
  ProviderStatus,
  Queued,
  Session,
  SessionPatch,
  Settings,
} from '@offsite/core/protocol'
import { createStore, type StoreApi, useStore as useZustand } from 'zustand'
import { call, type Refusal } from '@/api/connection'
import { updateConfig } from '@/api/machine-config'
import { home, machineKey } from '@/api/machines'
import type { MachineIcon } from '@/components/icons'
import {
  deleteDraft,
  getDraftSettings,
  saveDraftSettings,
} from '@/features/composer/drafts'
import { errorMessage } from '@/lib/utils'
import { type Prefs, savePrefs } from './prefs'
import { applyTheme } from './theme'
import { syncUrl } from './url'

export type Selection = {
  machine: string
  projectId: string
  sessionId: string | null
}

export type SettingsPage =
  | 'General'
  | 'Terminal'
  | 'Notifications'
  | 'Machine'
  | 'Claude'
  | 'Codex'
  | 'OpenCode'
  | 'Machines'
  | 'Shortcuts'

export const providerPages: Record<Provider, SettingsPage> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
}

export type Machine = {
  id: string
  addresses: string[]
  via: string | null
  status: 'connecting' | 'online' | 'offline' | Refusal
  name: string
  hostname: string
  label: string | null
  icon: MachineIcon
  token: string | null
  config: Config | null
  configError: string | null
  system: Omit<ConfigInfo, 'config'> | null
  accounts: Account[]
  activity: Record<string, Activity>
  providers: ProviderStatus[]
}

export type MachineProject = Project & { machine: string }

export type MachineSession = Session & { machine: string }

export type State = {
  machines: Machine[]
  sessions: MachineSession[]
  projects: MachineProject[]
  prefs: Prefs
  paletteOpen: boolean
  settingsOpen: boolean
  settingsPage: SettingsPage
  settingsMachine: string | null
  unseen: string[]
  selection: Selection | null
  loaded: boolean
  items: Item[]
  earlier: Item[]
  before: number | null
  partial: string
  requests: PermissionRequest[]
  queue: Queued[]
  settings: Settings
  draft: string | null
  context: Context | null
  capabilities: Capabilities | null
  error: string | null
  sentAt: number
}

export const emptySettings: Settings = {
  provider: 'claude',
  accountId: null,
  model: null,
  effort: null,
  mode: null,
  plan: false,
}

export function providerSettings(
  config: Config | null,
  provider: Provider
): Settings {
  if (config === null) return { ...emptySettings, provider }
  return { provider, ...config.composer[provider] }
}

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

export function machineOf(state: State, id: string) {
  const machine = state.machines.find((item) => item.id === id)
  if (machine === undefined) throw new Error(`unknown machine ${id}`)
  return machine
}

export function homeMachine(state: State) {
  return state.machines.find(
    (item) => home !== null && item.addresses.includes(home)
  )
}

export function projectOf(state: State, machine: string, projectId: string) {
  return state.projects.find(
    (item) => item.machine === machine && item.id === projectId
  )
}

export function defaultMachine(state: State) {
  return state.selection?.machine ?? state.machines.at(0)?.id ?? null
}

export function setMachine(id: string, patch: Partial<Machine>) {
  update({
    machines: getState().machines.map((item) =>
      item.id === id ? { ...item, ...patch } : item
    ),
  })
}

export function activityOf(
  machines: Machine[],
  machine: string,
  sessionId: string | null
) {
  if (sessionId === null) return undefined
  return machines.find((item) => item.id === machine)?.activity[sessionId]
}

export function selectedActivity(state: State) {
  const selection = state.selection
  if (selection === null) return undefined
  return activityOf(state.machines, selection.machine, selection.sessionId)
}

export function selectedRunning(state: State) {
  return selectedActivity(state)?.running === true
}

export function draftKey(selection: Selection) {
  return machineKey(
    selection.machine,
    selection.sessionId ?? selection.projectId
  )
}

export function openSession(selection: Selection) {
  const machine = machineOf(getState(), selection.machine)
  update({
    selection,
    loaded: selection.sessionId === null,
    items: [],
    earlier: [],
    before: null,
    partial: '',
    requests: [],
    queue: [],
    settings:
      getDraftSettings(draftKey(selection)) ??
      providerSettings(
        machine.config,
        getState().sessions.find(
          (item) =>
            item.machine === selection.machine &&
            item.id === selection.sessionId
        )?.provider ??
          machine.config?.composer.provider ??
          'claude'
      ),
    context: null,
    paletteOpen: false,
    unseen: getState().unseen.filter(
      (key) =>
        selection.sessionId === null ||
        key !== machineKey(selection.machine, selection.sessionId)
    ),
  })
  syncUrl()
  if (machine.accounts.length > 0)
    setAccounts(selection.machine, machine.accounts)
  void refreshCapabilities()
  if (selection.sessionId !== null && machine.status === 'online')
    call(selection.machine, 'sessions.open', {
      projectId: selection.projectId,
      sessionId: selection.sessionId,
    }).catch(showError)
}

export async function sendPrompt(prompt: Prompt, delivery: Delivery) {
  const selection = getState().selection
  if (selection === null) throw new Error('no session selected')
  if ('Notification' in window && Notification.permission === 'default')
    void Notification.requestPermission()
  update({ sentAt: Date.now() })
  await call(selection.machine, 'sessions.send', {
    sessionId: selection.sessionId,
    projectId: selection.projectId,
    prompt,
    settings: getState().settings,
    delivery,
  })
}

export function unqueue(id: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) return
  call(selection.machine, 'sessions.unqueue', {
    sessionId: selection.sessionId,
    id,
  }).catch(showError)
}

export function steer(id: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) return
  call(selection.machine, 'sessions.steer', {
    sessionId: selection.sessionId,
    id,
  }).catch(showError)
}

export function interrupt() {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) return
  call(selection.machine, 'sessions.interrupt', {
    sessionId: selection.sessionId,
  }).catch(showError)
}

export function stopTask(machine: string, sessionId: string, taskId: string) {
  call(machine, 'sessions.stopTask', { sessionId, taskId }).catch(showError)
}

export function changeSettings(patch: Partial<Settings>) {
  const settings = { ...getState().settings, ...patch }
  update({ settings })
  const selection = getState().selection
  if (selection === null) return
  saveDraftSettings(draftKey(selection), settings)
  const config = machineOf(getState(), selection.machine).config
  if (config !== null)
    updateConfig(selection.machine, {
      ...config,
      composer: {
        ...config.composer,
        provider: settings.provider,
        [settings.provider]: {
          accountId: settings.accountId,
          model: settings.model,
          effort: settings.effort,
          mode: settings.mode,
          plan: settings.plan,
        },
      },
    })
  if (patch.accountId !== undefined) void refreshCapabilities()
  if (
    selection.sessionId !== null &&
    activityOf(getState().machines, selection.machine, selection.sessionId) !==
      undefined &&
    patch.accountId === undefined
  )
    call(selection.machine, 'sessions.configure', {
      sessionId: selection.sessionId,
      settings,
    }).catch(showError)
}

export function respond(
  requestId: string,
  decision: Decision,
  answers: Record<string, string> | null
) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) return
  call(selection.machine, 'sessions.respond', {
    sessionId: selection.sessionId,
    requestId,
    decision,
    answers,
  }).catch(showError)
}

export function setAccounts(machine: string, accounts: Account[]) {
  setMachine(machine, { accounts })
  if (getState().selection?.machine !== machine) return
  const settings = getState().settings
  const valid = accounts.filter((item) => item.valid)
  if (valid.some((item) => item.id === settings.accountId)) return
  const same = valid.find((item) => item.provider === settings.provider)
  const other =
    getState().selection?.sessionId === null ? valid.at(0) : undefined
  if (same !== undefined) changeSettings({ accountId: same.id })
  else if (other !== undefined)
    changeSettings({
      ...providerSettings(
        machineOf(getState(), machine).config,
        other.provider
      ),
      accountId: other.id,
    })
  else if (settings.accountId !== null) changeSettings({ accountId: null })
}

export async function forkFrom(messageId: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) return
  try {
    const result = await call(selection.machine, 'sessions.fork', {
      sessionId: selection.sessionId,
      projectId: selection.projectId,
      messageId,
    })
    openSession({ ...selection, sessionId: result.sessionId })
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
    const result = await call(selection.machine, 'sessions.earlier', {
      sessionId: selection.sessionId,
      before,
    })
    if (getState().selection !== selection || getState().before !== before)
      return
    update({
      earlier: [...result.items, ...getState().earlier],
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
    const loaded = await call(selection.machine, 'sessions.agent', {
      sessionId: selection.sessionId,
      projectId: selection.projectId,
      agentId,
      parent,
    })
    if (getState().selection !== selection) return
    const ids = new Set(loaded.map((item) => item.id))
    const items = getState().items
    update({
      items: [
        ...items.filter((item) => item.parent !== parent),
        ...loaded,
        ...items.filter((item) => item.parent === parent && !ids.has(item.id)),
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
  update({
    settingsOpen,
    paletteOpen: false,
    ...(settingsOpen && { settingsMachine: defaultMachine(getState()) }),
  })
}

export function showSettingsPage(settingsPage: SettingsPage) {
  update({
    settingsOpen: true,
    settingsPage,
    paletteOpen: false,
    ...(!getState().settingsOpen && {
      settingsMachine: defaultMachine(getState()),
    }),
  })
}

export function updatePrefs(prefs: Prefs) {
  update({ prefs })
  savePrefs(prefs)
  applyTheme()
}

export async function editSession(
  machine: string,
  id: string,
  patch: SessionPatch
) {
  update({
    sessions: getState().sessions.map((item) =>
      item.machine === machine && item.id === id ? { ...item, ...patch } : item
    ),
  })
  try {
    await call(machine, 'sessions.update', { id, patch })
  } catch (error) {
    showError(error)
  }
}

export async function removeSession(machine: string, id: string) {
  update({
    sessions: getState().sessions.filter(
      (item) => item.machine !== machine || item.id !== id
    ),
  })
  deleteDraft(machineKey(machine, id))
  const selection = getState().selection
  if (selection?.machine === machine && selection.sessionId === id)
    openSession({ ...selection, sessionId: null })
  try {
    await call(machine, 'sessions.remove', { id })
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

export async function refreshAccounts(machine: string) {
  try {
    setAccounts(machine, await call(machine, 'accounts.list', undefined))
  } catch (error) {
    showError(error)
  }
}

export async function refreshCapabilities() {
  const selection = getState().selection
  if (selection === null) return
  const accountId = getState().settings.accountId
  if (accountId === null) {
    update({ capabilities: null })
    return
  }
  try {
    const capabilities = await call(selection.machine, 'capabilities', {
      accountId,
      projectId: selection.projectId,
    })
    if (
      getState().selection?.machine !== selection.machine ||
      getState().selection?.projectId !== selection.projectId ||
      getState().settings.accountId !== accountId
    )
      return
    update({ capabilities })
    if (getState().settings.model !== null) return
    const first =
      capabilities.models.find(
        (item) => !item.hidden && item.value === capabilities.defaultModel
      ) ?? capabilities.models.find((item) => !item.hidden)
    if (first === undefined) return
    changeSettings({
      model: first.value,
      ...(first.effort === null ? {} : { effort: first.effort }),
    })
  } catch (error) {
    showError(error)
  }
}
