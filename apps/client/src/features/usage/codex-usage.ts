import type { RateLimit, Usage } from '@offsite/core/providers'
import { leftOf } from '@/lib/usage'

export function codexLimitName(limit: RateLimit) {
  const minutes = Number(limit.window)
  const days = minutes / (24 * 60)
  if (Number.isInteger(days)) {
    return days === 1 ? '1 day' : `${days} days`
  }
  const hours = minutes / 60
  if (Number.isInteger(hours)) {
    return hours === 1 ? '1 hour' : `${hours} hours`
  }
  return minutes === 1 ? '1 minute' : `${minutes} minutes`
}

export function codexMeter(usage: Usage | undefined) {
  const windows = (usage?.limits ?? [])
    .map((limit) => limit.window)
    .sort((a, b) => Number(a) - Number(b))
  const shortest = windows.at(0)
  const longest = windows.at(-1)
  return {
    short: shortest === undefined ? null : leftOf(usage, shortest),
    long: longest === undefined ? null : leftOf(usage, longest),
  }
}
