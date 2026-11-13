import type { CodexLimit, CodexLimits } from '@offsite/core/providers'
import { leftOf } from '@/lib/usage'

export function codexRows(limits: CodexLimits) {
  const rows = []
  if (limits.primary !== null) {
    rows.push({
      key: 'primary',
      name: limitName(limits.primary),
      limit: limits.primary,
    })
  }
  if (limits.secondary !== null) {
    rows.push({
      key: 'secondary',
      name: limitName(limits.secondary),
      limit: limits.secondary,
    })
  }
  return rows
}

export function codexMeter(limits: CodexLimits) {
  const sorted = [limits.primary, limits.secondary]
    .filter((limit) => limit !== null)
    .sort((a, b) => a.minutes - b.minutes)
  return {
    short: leftOf(sorted.at(0) ?? null),
    long: leftOf(sorted.at(-1) ?? null),
  }
}

function limitName(limit: CodexLimit) {
  const days = limit.minutes / (24 * 60)
  if (Number.isInteger(days)) {
    return days === 1 ? '1 day' : `${days} days`
  }
  const hours = limit.minutes / 60
  if (Number.isInteger(hours)) {
    return hours === 1 ? '1 hour' : `${hours} hours`
  }
  return limit.minutes === 1 ? '1 minute' : `${limit.minutes} minutes`
}
