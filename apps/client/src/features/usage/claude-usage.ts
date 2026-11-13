import type { ClaudeLimits } from '@offsite/core/providers'
import { leftOf } from '@/lib/usage'

export function claudeRows(limits: ClaudeLimits) {
  return [
    { key: 'session', name: 'Session', limit: limits.session },
    { key: 'weekly', name: 'Weekly', limit: limits.weekly },
    { key: 'fable', name: 'Fable', limit: limits.fable },
  ]
}

export function claudeMeter(limits: ClaudeLimits) {
  return { short: leftOf(limits.session), long: leftOf(limits.weekly) }
}
