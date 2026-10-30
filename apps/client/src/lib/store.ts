import type {
  ComposerSettings,
  Config,
  ConfigWithDefaults,
  SessionSettings,
} from '@offsite/core/config'
import type {
  Item,
  PermissionRequest,
  Prompt,
  QueuedPrompt,
} from '@offsite/core/items'
import type { Project } from '@offsite/core/projects'
import type {
  Account,
  Capabilities,
  Provider,
  ProviderStatus,
} from '@offsite/core/providers'
import type {
  SessionActivity,
  ContextUsage,
  Session,
} from '@offsite/core/sessions'
import type { TerminalTab } from '@offsite/core/terminal'
import { createStore, type StoreApi, useStore as useZustand } from 'zustand'
import { machineKey } from '@/api/machines'
import { errorMessage } from '@/lib/utils'
import { type Prefs, savePrefs } from './prefs'
import { applyTheme } from './theme'

export type Selection = {
  machine: string
  projectId: string
  sessionId: string | null
}

export type SettingsPage =
  | 'General'
  | 'Editor'
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
  status: 'connecting' | 'online' | 'offline' | 'unpaired'
  name: string
  hostname: string
  icon: string | null
  label: string | null
  pairedAt: number | null
  config: Config | null
  composer: ComposerSettings | null
  configError: string | null
  system: Omit<ConfigWithDefaults, 'config'> | null
  claudeAccounts: Account[]
  codexAccounts: Account[]
  openCode: { available: boolean }
  notifier: boolean
  activity: Record<string, SessionActivity>
  providers: ProviderStatus[]
  terminals: TerminalTab[]
}

export type MachineProject = Project & { machine: string }

export type MachineSession = Session & { machine: string }

export type State = {
  machines: Machine[]
  sessions: MachineSession[]
  inactive: MachineSession[]
  inactiveVersion: number
  projects: MachineProject[]
  prefs: Prefs
  paletteOpen: boolean
  settingsOpen: boolean
  settingsPage: SettingsPage
  settingsAccount: string | null
  settingsEditedMachine: string | null
  settingsListing: boolean
  settingsMachine: string | null
  unseen: string[]
  selection: Selection | null
  loaded: boolean
  items: Item[]
  earlier: Item[]
  before: number | null
  partial: string
  requests: PermissionRequest[]
  queue: QueuedPrompt[]
  settings: SessionSettings
  draft: Prompt | null
  context: ContextUsage | null
  capabilities: Capabilities | null
  errors: string[]
  sentAt: number
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
  if (machine === undefined) {
    throw new Error(`unknown machine ${id}`)
  }
  return machine
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
  if (sessionId === null) {
    return undefined
  }
  return machines.find((item) => item.id === machine)?.activity[sessionId]
}

export function selectedActivity(state: State) {
  const selection = state.selection
  if (selection === null) {
    return undefined
  }
  return activityOf(state.machines, selection.machine, selection.sessionId)
}

export function selectedRunning(state: State) {
  return selectedActivity(state)?.running === true
}

export function draftKey(selection: Selection) {
  if (selection.sessionId === null) {
    return 'new'
  }
  return machineKey(selection.machine, selection.sessionId)
}

export function setDraft(draft: Prompt | null) {
  update({ draft })
}

export function showPalette(paletteOpen: boolean) {
  update({ paletteOpen })
}

export function showSettings(settingsOpen: boolean) {
  update({
    settingsOpen,
    paletteOpen: false,
    ...(settingsOpen && {
      settingsMachine: defaultMachine(getState()),
      settingsAccount: null,
      settingsEditedMachine: null,
      settingsListing: true,
    }),
  })
}

export function showSettingsPage(settingsPage: SettingsPage) {
  update({
    settingsOpen: true,
    settingsPage,
    settingsAccount: null,
    settingsEditedMachine: null,
    settingsListing: false,
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

export function showError(error: unknown) {
  update({ errors: [...getState().errors, errorMessage(error)] })
}

export function dismissErrors() {
  update({ errors: [] })
}
