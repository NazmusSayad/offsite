import type { ComposerSettings, SessionSettings } from '@offsite/core/config'
import type { Accounts, Provider } from '@offsite/core/providers'
import { call } from '@/api/connection'
import { updateComposer } from '@/api/machine-config'
import { saveDraftSettings } from '@/features/composer/drafts'
import {
  activityOf,
  draftKey,
  getState,
  type Machine,
  machineOf,
  setMachine,
  showError,
  update,
} from './store'
export const emptySettings: SessionSettings = {
  provider: 'claude',
  accountId: null,
  model: null,
  effort: null,
  mode: null,
  plan: false,
}

export function providerSettings(
  composer: ComposerSettings | null,
  provider: Provider
): SessionSettings {
  if (composer === null) {
    return { ...emptySettings, provider }
  }
  return { provider, ...composer[provider] }
}

export function newThreadSettings(machine: Machine): SessionSettings {
  if (machine.config === null) {
    return emptySettings
  }
  const newThreads = machine.config.newThreads
  return {
    ...providerSettings(machine.composer, newThreads.provider),
    accountId: newThreads.accountId,
    model: newThreads.models[newThreads.provider],
    effort: null,
  }
}

export function changeSettings(patch: Partial<SessionSettings>) {
  const settings = { ...getState().settings, ...patch }
  update({ settings })
  const selection = getState().selection
  if (selection === null) {
    return
  }
  if (selection.sessionId !== null) {
    saveDraftSettings(draftKey(selection), settings)
  }
  const composer = machineOf(getState(), selection.machine).composer
  if (composer !== null) {
    updateComposer(selection.machine, {
      ...composer,
      provider: settings.provider,
      [settings.provider]: {
        accountId: settings.accountId,
        model: settings.model,
        effort: settings.effort,
        mode: settings.mode,
        plan: settings.plan,
      },
    })
  }
  if (patch.accountId !== undefined) {
    void refreshCapabilities()
  }
  if (
    selection.sessionId !== null &&
    activityOf(getState().machines, selection.machine, selection.sessionId) !==
      undefined &&
    patch.accountId === undefined
  ) {
    call(selection.machine, 'sessions.configure', {
      sessionId: selection.sessionId,
      settings,
    }).catch(showError)
  }
}

export function setAccounts(machine: string, received: Accounts) {
  setMachine(machine, {
    claudeAccounts: received.claudeAccounts,
    codexAccounts: received.codexAccounts,
    openCode: received.openCode,
  })
  if (getState().selection?.machine !== machine) {
    return
  }
  const settings = getState().settings
  const choices = [
    ...[...received.claudeAccounts, ...received.codexAccounts]
      .filter((item) => item.valid)
      .map((item) => ({
        provider: item.provider,
        accountId: item.id as string | null,
      })),
    ...(received.openCode.available
      ? [{ provider: 'opencode' as const, accountId: null }]
      : []),
  ]
  if (
    choices.some(
      (item) =>
        item.provider === settings.provider &&
        item.accountId === settings.accountId
    )
  ) {
    return
  }
  const same = choices.find((item) => item.provider === settings.provider)
  const other =
    getState().selection?.sessionId === null ? choices.at(0) : undefined
  if (same !== undefined) {
    changeSettings({ accountId: same.accountId })
  } else if (other !== undefined) {
    const known = machineOf(getState(), machine)
    changeSettings({
      ...providerSettings(known.composer, other.provider),
      accountId: other.accountId,
      model:
        known.config === null
          ? null
          : known.config.newThreads.models[other.provider],
      effort: null,
    })
  } else if (settings.accountId !== null) {
    changeSettings({ accountId: null })
  }
}

export function resetNewThread(machine: string) {
  const selection = getState().selection
  if (selection?.machine !== machine || selection.sessionId !== null) {
    return
  }
  update({ settings: newThreadSettings(machineOf(getState(), machine)) })
  refreshSettings(machine)
}

export function refreshSettings(machine: string) {
  const known = machineOf(getState(), machine)
  if (
    known.claudeAccounts.length > 0 ||
    known.codexAccounts.length > 0 ||
    known.openCode.available
  ) {
    setAccounts(machine, {
      claudeAccounts: known.claudeAccounts,
      codexAccounts: known.codexAccounts,
      openCode: known.openCode,
    })
  }
  void refreshCapabilities()
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
  if (selection === null) {
    return
  }
  const { provider, accountId } = getState().settings
  if (provider !== 'opencode' && accountId === null) {
    update({ capabilities: null })
    return
  }
  try {
    const capabilities = await call(selection.machine, 'capabilities', {
      provider,
      accountId,
      projectId: selection.projectId,
    })
    if (
      getState().selection?.machine !== selection.machine ||
      getState().selection?.projectId !== selection.projectId ||
      getState().settings.provider !== provider ||
      getState().settings.accountId !== accountId
    ) {
      return
    }
    update({ capabilities })
    const settings = getState().settings
    if (settings.model !== null) {
      const effort = capabilities.models.find(
        (item) => item.value === settings.model
      )?.effort
      if (
        settings.provider !== 'opencode' &&
        settings.effort === null &&
        effort !== undefined &&
        effort !== null
      ) {
        changeSettings({ effort })
      }
      return
    }
    const first =
      capabilities.models.find(
        (item) => !item.hidden && item.value === capabilities.defaultModel
      ) ?? capabilities.models.find((item) => !item.hidden)
    if (first === undefined) {
      return
    }
    changeSettings({
      model: first.value,
      ...(first.effort === null ? {} : { effort: first.effort }),
    })
  } catch (error) {
    showError(error)
  }
}
