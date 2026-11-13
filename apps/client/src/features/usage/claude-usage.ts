import type { RateLimit, Usage } from '@offsite/core/providers'
import { leftOf } from '@/lib/usage'

export function claudeLimitName(limit: RateLimit) {
  if (limit.window === 'five_hour') {
    return 'Session'
  }
  if (limit.window === 'seven_day') {
    return 'Weekly'
  }
  if (
    limit.window === 'seven_day_overage_included' ||
    limit.window === 'overage'
  ) {
    return null
  }
  return limit.window
}

export function claudeMeter(usage: Usage | undefined) {
  return {
    short: leftOf(usage, 'five_hour'),
    long: leftOf(usage, 'seven_day'),
  }
}
