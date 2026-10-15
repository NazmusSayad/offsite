import type { RateLimit } from '@server/protocol'

const windowNames: Record<string, string> = {
  five_hour: '5h',
  seven_day: 'Week',
  seven_day_opus: 'Week (Opus)',
  seven_day_sonnet: 'Week (Sonnet)',
}

export function windowName(limit: RateLimit) {
  return windowNames[limit.window] ?? limit.window
}

export function limitLabel(limit: RateLimit) {
  if (limit.rejected) return `${windowName(limit)} limit reached`
  if (limit.utilization === null) return null
  return `${windowName(limit)} ${Math.round(limit.utilization * 100)}%`
}

export function resetLabel(limit: RateLimit) {
  if (limit.resetsAt === null) return null
  return `resets ${new Date(limit.resetsAt * 1000).toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })}`
}
