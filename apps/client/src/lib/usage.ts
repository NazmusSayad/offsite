import type { Account, RateLimit, Usage } from '@offsite/core/providers'
import { useEffect } from 'react'
import { call } from '@/api/connection'
import { getState, type Machine, showError, update, useStore } from './store'

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

export function useSelectedUsage() {
  const machine = useStore((state) => state.selection?.machine ?? null)
  const account = useStore((state) => {
    const known = state.machines.find((item) => item.id === machine)
    return [
      ...(known?.claudeAccounts ?? []),
      ...(known?.codexAccounts ?? []),
    ].find((item) => item.id === state.settings.accountId)
  })
  return useUsage(machine, account)
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
  limits: RateLimit[]
) {
  const account = findAccount(machine, accountId)
  if (account === undefined) {
    return
  }
  const key = usageKey(machine.id, account)
  const current = getState().usage[key] ?? {
    limits: [],
    fetchedAt: null,
    updatedAt: null,
    error: null,
  }
  update({
    usage: {
      ...getState().usage,
      [key]: {
        ...current,
        limits: [
          ...current.limits.map(
            (limit) =>
              limits.find((item) => item.window === limit.window) ?? limit
          ),
          ...limits.filter(
            (item) =>
              !current.limits.some((limit) => limit.window === item.window)
          ),
        ],
        updatedAt: Date.now(),
      },
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
    showError(error)
  } finally {
    loading.delete(usageKey(machine, account))
  }
}

function findAccount(machine: Machine, accountId: string) {
  return [...machine.claudeAccounts, ...machine.codexAccounts].find(
    (item) => item.id === accountId
  )
}
