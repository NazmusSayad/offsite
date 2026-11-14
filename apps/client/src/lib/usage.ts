import type { Account, Limits, RateLimit, Usage } from '@offsite/core/providers'
import { useEffect } from 'react'
import { call } from '@/api/connection'
import { claudeMeter, claudeRows } from '@/features/usage/claude-usage'
import { codexMeter, codexRows } from '@/features/usage/codex-usage'
import { logger } from '@/lib/log'
import { getState, type Machine, showError, update, useStore } from './store'

const log = logger.withTag('usage')

const freshFor = 300_000
const loading = new Map<string, Promise<void>>()

export function usageKey(machine: string, account: Account) {
  if (account.email === null) {
    return `${machine}\n${account.id}`
  }
  return `${account.provider}\n${account.email}\n${account.organization ?? ''}`
}

export function hasUsage(account: Account) {
  return account.enabled && account.error === null && account.email !== null
}

export function leftOf(limit: RateLimit | null) {
  if (limit === null) {
    return null
  }
  if (limit.rejected) {
    return 0
  }
  if (limit.utilization === null) {
    return null
  }
  return Math.max(0, 100 - Math.round(limit.utilization * 100))
}

export function usageRows(usage: Usage | undefined) {
  const limits = usage?.limits ?? null
  if (limits === null) {
    return []
  }
  switch (limits.provider) {
    case 'claude':
      return claudeRows(limits)
    case 'codex':
      return codexRows(limits)
  }
}

export function usageMeter(usage: Usage | undefined) {
  const limits = usage?.limits ?? null
  if (limits === null) {
    return { short: null, long: null }
  }
  switch (limits.provider) {
    case 'claude': {
      const meter = claudeMeter(limits)
      return { short: leftOf(meter.short), long: leftOf(meter.long) }
    }
    case 'codex': {
      const meter = codexMeter(limits)
      return { short: leftOf(meter.short), long: leftOf(meter.long) }
    }
  }
}

export function useUsage(machine: string | null, account: Account | undefined) {
  const usage = useStore((state) =>
    machine === null || account === undefined
      ? undefined
      : state.usage[usageKey(machine, account)]
  )

  useEffect(() => {
    if (machine !== null && account !== undefined && hasUsage(account)) {
      void loadUsage(machine, account, false)
    }
  }, [machine, account])

  return usage
}

export function useSelectedAccount() {
  const machine = useStore((state) => state.selection?.machine ?? null)
  const account = useStore((state) => {
    const known = state.machines.find((item) => item.id === machine)
    return [
      ...(known?.claudeAccounts ?? []),
      ...(known?.codexAccounts ?? []),
    ].find((item) => item.id === state.settings.accountId)
  })
  return { machine, account }
}

export function useSelectedUsage() {
  const selected = useSelectedAccount()
  return useUsage(selected.machine, selected.account)
}

export function receiveUsage(
  machine: Machine,
  accountId: string,
  usage: Usage
) {
  const account = findAccount(machine, accountId)
  if (account === undefined) {
    return
  }
  const key = usageKey(machine.id, account)
  const current = getState().usage[key]
  if (
    current !== undefined &&
    current.fetchedAt !== null &&
    usage.fetchedAt !== null &&
    current.fetchedAt > usage.fetchedAt
  ) {
    return
  }
  update({
    usage: {
      ...getState().usage,
      [key]:
        usage.error === null || current === undefined
          ? usage
          : { ...current, fetchedAt: usage.fetchedAt, error: usage.error },
    },
  })
}

export function receiveLimits(
  machine: Machine,
  accountId: string,
  limits: Limits
) {
  const account = findAccount(machine, accountId)
  if (account === undefined) {
    return
  }
  const key = usageKey(machine.id, account)
  const current = getState().usage[key] ?? {
    limits: null,
    fetchedAt: null,
    updatedAt: null,
    error: null,
  }
  update({
    usage: {
      ...getState().usage,
      [key]: { ...current, limits, updatedAt: Date.now() },
    },
  })
}

export function loadUsage(machine: string, account: Account, force: boolean) {
  const key = usageKey(machine, account)
  const pending = loading.get(key)
  if (pending !== undefined) {
    return pending
  }
  const current = getState().usage[key]
  if (
    !force &&
    current !== undefined &&
    current.fetchedAt !== null &&
    Date.now() - current.fetchedAt < freshFor
  ) {
    return Promise.resolve()
  }
  const next = fetchUsage(machine, account, force)
  loading.set(key, next)
  return next
}

async function fetchUsage(machine: string, account: Account, force: boolean) {
  try {
    const usage = await call(machine, 'accounts.usage', {
      id: account.id,
      force,
    })
    const known = getState().machines.find((item) => item.id === machine)
    if (known !== undefined) {
      receiveUsage(known, account.id, usage)
    }
  } catch (error) {
    if (force) {
      showError(error)
    } else {
      log.error('could not load usage', error)
    }
  } finally {
    loading.delete(usageKey(machine, account))
  }
}

function findAccount(machine: Machine, accountId: string) {
  return [...machine.claudeAccounts, ...machine.codexAccounts].find(
    (item) => item.id === accountId
  )
}
