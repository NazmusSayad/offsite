import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const isMac = navigator.userAgent.includes('Mac')
export const mod = /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'

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
