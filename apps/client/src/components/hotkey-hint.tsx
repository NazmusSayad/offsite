import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getState, update, useStore } from '@/lib/store'
import { cn, mod } from '@/lib/utils'

const modKey = mod === '⌘' ? 'Meta' : 'Control'

export function useHotkeyHints() {
  useEffect(() => {
    let timer: number | null = null

    function hide() {
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (getState().hotkeyHints) {
        update({ hotkeyHints: false })
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== modKey || event.shiftKey || event.altKey) {
        hide()
        return
      }
      if (event.repeat || timer !== null || getState().hotkeyHints) {
        return
      }
      timer = window.setTimeout(() => {
        timer = null
        update({ hotkeyHints: true })
      }, 500)
    }

    addEventListener('keydown', onKeyDown, true)
    addEventListener('keyup', hide, true)
    addEventListener('blur', hide)
    document.addEventListener('visibilitychange', hide)
    return () => {
      hide()
      removeEventListener('keydown', onKeyDown, true)
      removeEventListener('keyup', hide, true)
      removeEventListener('blur', hide)
      document.removeEventListener('visibilitychange', hide)
    }
  }, [])
}

export function HotkeyHint(props: {
  keyName: string
  placement: 'above' | 'below' | 'below-start' | 'below-end' | 'row'
}) {
  const shown = useStore((state) => state.hotkeyHints)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  useLayoutEffect(() => {
    if (!shown) {
      setAnchor(null)
      return
    }
    const parent = anchorRef.current?.parentElement
    if (parent === null || parent === undefined) {
      throw new Error('the hotkey hint has no parent element')
    }
    setAnchor(parent.getBoundingClientRect())
  }, [shown])

  return (
    <span ref={anchorRef} hidden>
      {anchor !== null &&
        createPortal(
          <kbd
            className={cn(
              'bg-popover text-popover-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 pointer-events-none fixed z-[140] inline-flex h-5 items-center rounded-md border px-1.5 font-sans text-[11px] leading-none font-medium tracking-normal whitespace-nowrap normal-case shadow-md motion-safe:duration-100',
              mod === '⌘' ? 'gap-px' : 'gap-1',
              props.placement === 'above' &&
                '-translate-x-1/2 -translate-y-full',
              props.placement === 'below' && '-translate-x-1/2',
              props.placement === 'below-end' && '-translate-x-full',
              props.placement === 'row' && '-translate-x-full -translate-y-1/2'
            )}
            style={position(anchor, props.placement)}
          >
            <span className="text-muted-foreground">{mod}</span>
            <span>{props.keyName}</span>
          </kbd>,
          document.body
        )}
    </span>
  )
}

function position(
  anchor: DOMRect,
  placement: 'above' | 'below' | 'below-start' | 'below-end' | 'row'
) {
  if (placement === 'above') {
    return { left: anchor.left + anchor.width / 2, top: anchor.top - 6 }
  }
  if (placement === 'below') {
    return { left: anchor.left + anchor.width / 2, top: anchor.bottom + 6 }
  }
  if (placement === 'below-start') {
    return { left: anchor.left, top: anchor.bottom + 6 }
  }
  if (placement === 'below-end') {
    return { left: anchor.right, top: anchor.bottom + 6 }
  }
  if (placement === 'row') {
    return { left: anchor.right, top: anchor.top + anchor.height / 2 }
  }
  throw new Error(`unknown hotkey hint placement ${placement}`)
}
