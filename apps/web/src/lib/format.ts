import type { Provider } from '@offsite/core/protocol'

export const providerNames: Record<Provider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
}

export function projectName(cwd: string) {
  return cwd.split(/[\\/]/).filter(Boolean).at(-1) ?? cwd
}

export function timeAgo(time: number) {
  const seconds = Math.round((Date.now() - time) / 1000)
  if (seconds < 60) {
    return 'now'
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m`
  }
  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h`
  }
  return `${Math.floor(seconds / 86_400)}d`
}

export function clock(time: number) {
  const date = new Date(time)
  const formatted = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const now = new Date()
  const days = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      86_400_000
  )
  if (days <= 0) {
    return formatted
  }
  if (days === 1) {
    return `yesterday at ${formatted}`
  }
  const day = date.toLocaleDateString(
    undefined,
    date.getFullYear() === now.getFullYear()
      ? { month: 'numeric', day: 'numeric' }
      : { month: 'numeric', day: 'numeric', year: 'numeric' }
  )
  return `${day} ${formatted}`
}

export function fullTime(time: number) {
  const date = new Date(time)
  const day = date.getDate()
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th'
  const formatted = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  const month = date.toLocaleDateString('en-US', { month: 'long' })
  return `${formatted}, ${day}${suffix} ${month} ${date.getFullYear()}`
}

export function compact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value)
}

export function duration(seconds: number) {
  const total = Math.round(seconds)
  const minutes = Math.floor(total / 60)
  const rest = String(total % 60).padStart(2, '0')
  if (minutes < 60) {
    return `${minutes}:${rest}`
  }
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${rest}`
}
