import { type PointerEvent, useEffect, useRef, useState } from 'react'

export function useHoverMenu() {
  const [open, setOpen] = useState(false)
  const closing = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (closing.current !== null) {
        clearTimeout(closing.current)
      }
    },
    []
  )

  function hover(event: PointerEvent, inside: boolean) {
    if (event.pointerType !== 'mouse') {
      return
    }
    if (closing.current !== null) {
      clearTimeout(closing.current)
      closing.current = null
    }
    if (inside) {
      setOpen(true)
      return
    }
    closing.current = window.setTimeout(() => setOpen(false), 150)
  }

  return {
    root: { open, onOpenChange: setOpen, modal: false },
    area: {
      onPointerEnter: (event: PointerEvent) => hover(event, true),
      onPointerLeave: (event: PointerEvent) => hover(event, false),
    },
    trigger: {
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType === 'mouse') {
          event.preventDefault()
          setOpen(true)
        }
      },
    },
  }
}
