import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let text: string | null = null
let timer: number | null = null

export function showToast(next: string) {
  if (timer !== null) clearTimeout(timer)
  text = next
  timer = window.setTimeout(() => {
    timer = null
    text = null
    for (const listener of listeners) listener()
  }, 3000)
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function Toast() {
  const current = useSyncExternalStore(subscribe, () => text)
  if (current === null) return null
  return (
    <div className="bg-popover text-popover-foreground fixed right-4 bottom-4 z-50 rounded-md border px-3 py-2 shadow-md">
      {current}
    </div>
  )
}
