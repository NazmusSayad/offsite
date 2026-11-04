import type { RateLimit, Usage } from '@offsite/core/providers'
import { claudeLimits } from '../lib/claude/index.ts'
import { codexLimits } from '../lib/codex/index.ts'
import { broadcast } from '../lib/hub.ts'
import { type StoredAccount, storedAccounts } from './accounts.ts'

const freshFor = 60_000
const forcedFreshFor = 10_000
const entries = new Map<string, Usage>()
const fetching = new Map<string, Promise<Usage>>()

export function cachedUsage(accountId: string): Usage {
  return (
    entries.get(accountId) ?? {
      limits: [],
      fetchedAt: null,
      updatedAt: null,
      error: null,
    }
  )
}

export function recordLimits(accountId: string, limits: RateLimit[]) {
  const current = cachedUsage(accountId)
  entries.set(accountId, {
    ...current,
    limits: [
      ...current.limits.map(
        (limit) => limits.find((item) => item.window === limit.window) ?? limit
      ),
      ...limits.filter(
        (item) => !current.limits.some((limit) => limit.window === item.window)
      ),
    ],
    updatedAt: Date.now(),
  })
  broadcast({ type: 'limits', accountId, limits })
}

export async function readUsage(accountId: string, force: boolean) {
  const current = cachedUsage(accountId)
  if (
    current.fetchedAt !== null &&
    Date.now() - current.fetchedAt < (force ? forcedFreshFor : freshFor)
  ) {
    return current
  }
  const pending = fetching.get(accountId)
  if (pending !== undefined) {
    return pending
  }
  const next = fetchUsage(accountId)
  fetching.set(accountId, next)
  try {
    return await next
  } finally {
    fetching.delete(accountId)
  }
}

export function forgetUsage(accountId: string) {
  entries.delete(accountId)
}

async function fetchUsage(accountId: string) {
  const account = storedAccounts().find((item) => item.id === accountId)
  if (account === undefined) {
    throw new Error('That account was removed')
  }
  let usage: Usage
  try {
    const limits = await providerLimits(account)
    usage = {
      limits,
      fetchedAt: Date.now(),
      updatedAt: Date.now(),
      error: null,
    }
  } catch (error) {
    console.warn(`could not read usage limits for ${account.name}: ${error}`)
    usage = {
      ...cachedUsage(accountId),
      fetchedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    }
  }
  entries.set(accountId, usage)
  broadcast({ type: 'usage', accountId, usage })
  return usage
}

function providerLimits(account: StoredAccount) {
  switch (account.provider) {
    case 'claude':
      return claudeLimits(account)
    case 'codex':
      return codexLimits(account)
  }
}
