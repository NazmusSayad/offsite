import type { RateLimit, Usage } from '@offsite/core/providers'
import { claudeLimits } from '../lib/claude/index.ts'
import { codexLimits } from '../lib/codex/index.ts'
import { broadcast } from '../lib/hub.ts'
import { logger } from '../lib/log.ts'
import { type StoredAccount, storedAccounts } from './accounts.ts'

const freshFor = 60_000
const forcedFreshFor = 10_000
const log = logger.withTag('usage')
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
  log.debug(
    `account ${accountId} reported ${limits.map((limit) => limit.window).join(', ')} limits from a running session`
  )
  broadcast({ type: 'limits', accountId, limits })
}

export async function readUsage(accountId: string, force: boolean) {
  const current = cachedUsage(accountId)
  if (
    current.fetchedAt !== null &&
    Date.now() - current.fetchedAt < (force ? forcedFreshFor : freshFor)
  ) {
    log.debug(
      `account ${accountId} served from cache, ${Math.round((Date.now() - current.fetchedAt) / 1000)}s old${force ? ' (forced)' : ''}`
    )
    return current
  }
  const pending = fetching.get(accountId)
  if (pending !== undefined) {
    log.debug(`account ${accountId} joined the fetch in progress`)
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
  const started = performance.now()
  log.debug(`fetching limits for ${account.name} (${account.provider})`)
  try {
    const limits = await providerLimits(account)
    log.debug(
      `fetched ${limits.length} limits for ${account.name} in ${Math.round(performance.now() - started)}ms`
    )
    usage = {
      limits,
      fetchedAt: Date.now(),
      updatedAt: Date.now(),
      error: null,
    }
  } catch (error) {
    log.warn(`could not read usage limits for ${account.name}:`, error)
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
