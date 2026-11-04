import type { RateLimit } from '@offsite/core/providers'

const windowNames: Record<string, string> = {
  five_hour: 'session',
  seven_day: 'weekly',
  seven_day_opus: 'opus',
  seven_day_sonnet: 'sonnet',
}

export function windowName(limit: RateLimit) {
  return windowNames[limit.window] ?? limit.window.toLowerCase()
}
