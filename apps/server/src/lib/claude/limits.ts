import os from 'node:os'
import { query, type SDKRateLimitInfo } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudeLimits, RateLimit } from '@offsite/core/providers'
import type { StoredAccount } from '../../services/accounts.ts'
import { cachedUsage, recordLimits } from '../../services/usage.ts'
import { claudeOptions, idle } from './claude.ts'
import { isRecord } from './content.ts'

export function recordEventLimits(
  accountId: string | null,
  info: SDKRateLimitInfo
) {
  if (accountId === null) {
    throw new Error('Rate limit event for a run without an account')
  }
  const current = cachedUsage(accountId).limits
  if (current !== null && current.provider !== 'claude') {
    throw new Error(`Account ${accountId} has ${current.provider} limits`)
  }
  recordLimits(accountId, eventLimits(info, current))
}

export function eventLimits(
  info: SDKRateLimitInfo,
  current: ClaudeLimits | null
): ClaudeLimits {
  const limits: ClaudeLimits =
    current === null
      ? { provider: 'claude', session: null, weekly: null, fable: null }
      : { ...current }
  const windows = (info as { unifiedWindows?: unknown }).unifiedWindows
  if (isRecord(windows) && isRecord(windows.five_hour)) {
    limits.session = windowLimit(windows.five_hour, limits.session)
  }
  if (isRecord(windows) && isRecord(windows.seven_day)) {
    limits.weekly = windowLimit(windows.seven_day, limits.weekly)
  }
  if (info.rateLimitType === 'five_hour') {
    limits.session = {
      utilization: info.utilization ?? limits.session?.utilization ?? null,
      resetsAt: info.resetsAt ?? limits.session?.resetsAt ?? null,
      rejected: info.status === 'rejected',
    }
  }
  if (info.rateLimitType === 'seven_day') {
    limits.weekly = {
      utilization: info.utilization ?? limits.weekly?.utilization ?? null,
      resetsAt: info.resetsAt ?? limits.weekly?.resetsAt ?? null,
      rejected: info.status === 'rejected',
    }
  }
  return limits
}

function windowLimit(
  window: Record<string, unknown>,
  current: RateLimit | null
): RateLimit {
  return {
    utilization:
      typeof window.utilization === 'number' ? window.utilization : null,
    resetsAt: typeof window.resetsAt === 'number' ? window.resetsAt : null,
    rejected: current?.rejected ?? false,
  }
}

export async function claudeLimits(
  account: StoredAccount
): Promise<ClaudeLimits> {
  const closed = Promise.withResolvers<void>()
  const probe = query({
    prompt: idle(closed.promise),
    options: claudeOptions(account.id, os.homedir()),
  })
  try {
    await probe.initializationResult()
    const usage =
      await probe.usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET({
        skipBehaviors: true,
      })
    if (usage.rate_limits === null) {
      return {
        provider: 'claude',
        session: null,
        weekly: null,
        fable: null,
      }
    }
    return {
      provider: 'claude',
      session: toLimit(usage.rate_limits.five_hour),
      weekly: toLimit(usage.rate_limits.seven_day),
      fable: toLimit(
        usage.rate_limits.model_scoped?.find(
          (row) => row.display_name === 'Fable'
        )
      ),
    }
  } finally {
    closed.resolve()
    probe.close()
  }
}

function toLimit(
  window:
    | { utilization: number | null; resets_at: string | null }
    | null
    | undefined
): RateLimit | null {
  if (window === undefined || window === null) {
    return null
  }
  return {
    utilization: window.utilization === null ? null : window.utilization / 100,
    resetsAt:
      window.resets_at === null ? null : Date.parse(window.resets_at) / 1000,
    rejected: window.utilization !== null && window.utilization >= 100,
  }
}
