import type {
  Account,
  Config,
  Provider,
  Settings,
} from '@offsite/core/protocol'
import { call } from '@/api/connection'
import { updateConfig } from '@/api/machine-config'
import { saveDraftSettings } from '@/features/composer/drafts'
import {
  activityOf,
  draftKey,
  getState,
  machineOf,
  setMachine,
  showError,
  update,
} from './store'
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

export function changeSettings(patch: Partial<Settings>) {
  const settings = { ...getState().settings, ...patch }
  update({ settings })
  const selection = getState().selection
  if (selection === null) return
  if (selection.sessionId !== null)
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
