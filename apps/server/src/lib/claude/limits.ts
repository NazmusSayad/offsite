import os from 'node:os'
import { query, type SDKRateLimitInfo } from '@anthropic-ai/claude-agent-sdk'
import type { RateLimit } from '@offsite/core/providers'
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
  recordLimits(accountId, eventLimits(info, cachedUsage(accountId).limits))
}

export function eventLimits(info: SDKRateLimitInfo, current: RateLimit[]) {
  const changed = new Map<string, RateLimit>()
  const windows = (info as { unifiedWindows?: unknown }).unifiedWindows
  if (isRecord(windows)) {
    for (const [name, value] of Object.entries(windows)) {
      if (isRecord(value)) {
        changed.set(name, {
          window: name,
          utilization:
            typeof value.utilization === 'number' ? value.utilization : null,
          resetsAt: typeof value.resetsAt === 'number' ? value.resetsAt : null,
          rejected:
            current.find((limit) => limit.window === name)?.rejected ?? false,
        })
      }
    }
  }
  if (info.rateLimitType !== undefined) {
    const existing =
      changed.get(info.rateLimitType) ??
      current.find((limit) => limit.window === info.rateLimitType)
    changed.set(info.rateLimitType, {
      window: info.rateLimitType,
      utilization: info.utilization ?? existing?.utilization ?? null,
      resetsAt: info.resetsAt ?? existing?.resetsAt ?? null,
      rejected: info.status === 'rejected',
    })
  }
  return [...changed.values()]
}

export async function claudeLimits(account: StoredAccount) {
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
      return []
    }
    const windows = [
      { name: 'five_hour', window: usage.rate_limits.five_hour },
      { name: 'seven_day', window: usage.rate_limits.seven_day },
      ...(usage.rate_limits.model_scoped ?? []).map((row) => ({
        name: row.display_name,
        window: row,
      })),
    ]
    return windows.flatMap((entry): RateLimit[] => {
      const window = entry.window
      if (window === undefined || window === null) {
        return []
      }
      return [
        {
          window: entry.name,
          utilization:
            window.utilization === null ? null : window.utilization / 100,
          resetsAt:
            window.resets_at === null
              ? null
              : Date.parse(window.resets_at) / 1000,
          rejected: window.utilization !== null && window.utilization >= 100,
        },
      ]
    })
  } finally {
    closed.resolve()
    probe.close()
  }
}
