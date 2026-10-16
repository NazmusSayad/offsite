import type { RateLimit } from '@offsite/core/protocol'

const windowNames: Record<string, string> = {
  five_hour: '5h',
  seven_day: 'Week',
  seven_day_opus: 'Week (Opus)',
  seven_day_sonnet: 'Week (Sonnet)',
}

function windowName(limit: RateLimit) {
  return windowNames[limit.window] ?? limit.window
}

export function limitLabel(limit: RateLimit) {
  if (limit.rejected) return `${windowName(limit)} limit reached`
  if (limit.utilization === null) return null
  return `${windowName(limit)} ${Math.round(limit.utilization * 100)}%`
}
