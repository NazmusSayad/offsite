import type { CodexLimit, CodexLimits } from '@offsite/core/providers'
import { type StoredAccount, storedAccounts } from '../../services/accounts.ts'
import { cachedUsage, recordLimits } from '../../services/usage.ts'
import { appServer, codexBaseDir } from './app-server.ts'
import type { RateLimitSnapshot } from './types.ts'

export function publishCodexLimits(home: string, snapshot: RateLimitSnapshot) {
  for (const account of storedAccounts()) {
    if (
      account.provider === 'codex' &&
      (account.configDir ?? codexBaseDir) === home
    ) {
      const current = cachedUsage(account.id).limits
      if (current !== null && current.provider !== 'codex') {
        throw new Error(`Account ${account.id} has ${current.provider} limits`)
      }
      const next = toLimits(snapshot)
      recordLimits(account.id, {
        provider: 'codex',
        primary: next.primary ?? current?.primary ?? null,
        secondary: next.secondary ?? current?.secondary ?? null,
      })
    }
  }
}

export async function codexLimits(account: StoredAccount) {
  const result = await appServer(account.configDir ?? codexBaseDir).request<{
    rateLimits: RateLimitSnapshot
  }>('account/rateLimits/read', {})
  return toLimits(result.rateLimits)
}

function toLimits(snapshot: RateLimitSnapshot): CodexLimits {
  return {
    provider: 'codex',
    primary: toLimit(snapshot.primary),
    secondary: toLimit(snapshot.secondary),
  }
}

function toLimit(window: RateLimitSnapshot['primary']): CodexLimit | null {
  if (window === null || window.windowDurationMins === null) {
    return null
  }
  return {
    minutes: window.windowDurationMins,
    utilization: window.usedPercent / 100,
    resetsAt: window.resetsAt,
    rejected: window.usedPercent >= 100,
  }
}
