import type { KeyboardEvent } from 'react'

export function moveFocus(
  event: KeyboardEvent<HTMLElement>,
  previousKey: string,
  nextKey: string,
  selector: string
) {
  if (event.key !== previousKey && event.key !== nextKey) {
    return
  }
  event.preventDefault()
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(selector)]
  if (items.length === 0) {
    return
  }
  const index = items.findIndex((item) => item === document.activeElement)
  const next = event.key === nextKey ? index + 1 : index - 1
  items[Math.min(Math.max(next, 0), items.length - 1)].focus()
}
