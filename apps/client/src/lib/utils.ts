import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isMac = navigator.userAgent.includes('Mac')
export const isWindows = navigator.userAgent.includes('Windows')
export const mod = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'
export const touch = window.matchMedia('(pointer: coarse)')
export const wide = window.matchMedia('(min-width: 768px)')

export function splitAtLimit<T>(
  items: T[],
  limit: number,
  selected: (item: T) => boolean
) {
  const index = items.findIndex(selected)
  if (index === -1 || index < limit) {
    return { shown: items.slice(0, limit), more: items.slice(limit) }
  }
  return {
    shown: [...items.slice(0, limit - 1), items[index]],
    more: [...items.slice(limit - 1, index), ...items.slice(index + 1)],
  }
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function drag(
  event: React.PointerEvent<HTMLElement>,
  move: (event: PointerEvent) => void
) {
  event.preventDefault()
  const target = event.currentTarget
  target.setPointerCapture(event.pointerId)
  function up() {
    target.removeEventListener('pointermove', move)
    target.removeEventListener('pointerup', up)
  }
  target.addEventListener('pointermove', move)
  target.addEventListener('pointerup', up)
}
