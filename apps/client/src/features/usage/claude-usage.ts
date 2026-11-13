import type { ClaudeLimits } from '@offsite/core/providers'

export function claudeRows(limits: ClaudeLimits) {
  return [
    { key: 'session', name: 'Session', limit: limits.session },
    { key: 'weekly', name: 'Weekly', limit: limits.weekly },
    { key: 'fable', name: 'Fable', limit: limits.fable },
  ]
}

export function claudeMeter(limits: ClaudeLimits) {
  return { short: limits.session, long: limits.weekly }
}
