import type { RateLimit } from '@offsite/core/providers'

const windowNames: Record<string, string> = {
  five_hour: '5h',
  seven_day: 'Week',
  seven_day_opus: 'Week (Opus)',
  seven_day_sonnet: 'Week (Sonnet)',
}

export function windowName(limit: RateLimit) {
  return windowNames[limit.window] ?? limit.window
}
