import {
  DEFAULT_CLAUDE_PERMISSION_MODE,
  DEFAULT_CODEX_PERMISSION_MODE,
  DEFAULT_PROVIDER,
  type SessionSettings,
} from '@offsite/core/config'
import type { Accounts, Capabilities, Provider } from '@offsite/core/providers'
import { maxBy } from 'es-toolkit'
import { call } from '@/api/connection'
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

let loading: { key: string; result: Promise<Capabilities> } | null = null

export function lastEffort(
  machine: Machine,
  provider: Provider,
  model: string
) {
  return (
    machine.lastEfforts.find(
      (item) => item.provider === provider && item.model === model
    )?.effort ?? null
  )
}

export function saveLastEffort(
  provider: Provider,
  model: string,
  effort: string | null
) {
  for (const machine of getState().machines) {
    if (machine.status === 'online') {
      call(machine.id, 'lastEffort.save', { provider, model, effort }).catch(
        showError
      )
    }
  }
}

export function providerSettings(
  machine: Machine,
  provider: Provider
): SessionSettings {
  const row = machine.lastUsed?.find((item) => item.provider === provider)
  const mode =
    provider === 'claude'
      ? DEFAULT_CLAUDE_PERMISSION_MODE
      : provider === 'codex'
        ? DEFAULT_CODEX_PERMISSION_MODE
        : null
  if (row === undefined) {
    return {
      provider,
      accountId: null,
      model: null,
      effort: null,
      mode,
      plan: false,
    }
  }
  return {
    provider,
    accountId: row.accountId,
    model: row.model,
    effort: lastEffort(machine, provider, row.model),
    mode,
    plan: false,
  }
}

export function newThreadSettings(machine: Machine): SessionSettings {
  const latest = maxBy(machine.lastUsed ?? [], (item) => item.usedAt)
  if (latest === undefined) {
    return {
      provider: DEFAULT_PROVIDER,
      accountId: null,
      model: null,
      effort: null,
      mode: DEFAULT_CLAUDE_PERMISSION_MODE,
      plan: false,
    }
  }
  return providerSettings(machine, latest.provider)
}

export function saveLastUsed(
  machine: string,
  provider: Provider,
  accountId: string | null,
  model: string
) {
  call(machine, 'lastUsed.save', { provider, accountId, model }).catch(
    showError
  )
  const others = getState().machines.filter(
    (item) => item.id !== machine && item.status === 'online'
  )
  if (provider === 'opencode') {
    for (const other of others.filter((item) => item.openCode.available)) {
      call(other.id, 'lastUsed.save', {
        provider,
        accountId: null,
        model,
      }).catch(showError)
    }
    return
  }
  const current = machineOf(getState(), machine)
  const identity = (
    provider === 'claude' ? current.claudeAccounts : current.codexAccounts
  ).find((item) => item.id === accountId)?.identity
  if (identity === undefined || identity === null) {
    return
  }
  for (const other of others) {
    const match = (
      provider === 'claude' ? other.claudeAccounts : other.codexAccounts
    ).find(
      (item) =>
        item.enabled &&
        item.identity !== null &&
        item.identity.accountId === identity.accountId &&
        item.identity.organizationId === identity.organizationId
    )
    if (match !== undefined) {
      call(other.id, 'lastUsed.save', {
        provider,
        accountId: match.id,
        model,
      }).catch(showError)
    }
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
    changeSettings({
      ...providerSettings(machineOf(getState(), machine), other.provider),
      accountId: other.accountId,
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
    const key = JSON.stringify([
      selection.machine,
      provider,
      accountId,
      selection.projectId,
    ])
    if (loading?.key !== key) {
      const result = call(selection.machine, 'capabilities', {
        provider,
        accountId,
        projectId: selection.projectId,
      })
      function done() {
        if (loading?.result === result) {
          loading = null
        }
      }
      result.then(done, done)
      loading = { key, result }
    }
    const capabilities = await loading.result
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
      effort:
        lastEffort(
          machineOf(getState(), selection.machine),
          provider,
          first.value
        ) ?? first.effort,
    })
  } catch (error) {
    showError(error)
  }
}
