import type { RateLimit } from '@offsite/core/providers'
import { type StoredAccount, storedAccounts } from '../../services/accounts.ts'
import { recordLimits } from '../../services/usage.ts'
import { appServer, codexBaseDir } from './app-server.ts'
import type { RateLimitSnapshot } from './types.ts'

export function publishCodexLimits(home: string, snapshot: RateLimitSnapshot) {
  for (const account of storedAccounts()) {
    if (
      account.provider === 'codex' &&
      (account.configDir ?? codexBaseDir) === home
    ) {
      recordLimits(account.id, toLimits(snapshot))
    }
  }
}

export async function codexLimits(account: StoredAccount) {
  const result = await appServer(account.configDir ?? codexBaseDir).request<{
    rateLimits: RateLimitSnapshot
  }>('account/rateLimits/read', {})
  return toLimits(result.rateLimits)
}

function toLimits(snapshot: RateLimitSnapshot): RateLimit[] {
  return [snapshot.primary, snapshot.secondary].flatMap((window) =>
    window === null || window.windowDurationMins === null
      ? []
      : [
          {
            window: String(window.windowDurationMins),
            utilization: window.usedPercent / 100,
            resetsAt: window.resetsAt,
            rejected: window.usedPercent >= 100,
          },
        ]
  )
}
