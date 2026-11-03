import { type RefObject, useEffect, useRef, useState } from 'react'
import { Tooltip } from '@/components/ui/tooltip'
import type { Row, UserItem } from '@/features/transcript/timeline'
import { cn } from '@/lib/utils'

export function TurnJumper(props: {
  turns: Extract<Row, { kind: 'user' }>[]
  scroller: RefObject<HTMLDivElement | null>
  onJump: (key: string) => void
}) {
  const [active, setActive] = useState<string | null>(null)
  const [fits, setFits] = useState(true)
  const strip = useRef<HTMLDivElement>(null)
  const current = active ?? props.turns.at(-1)?.key ?? null

  useEffect(() => {
    const element = props.scroller.current
    if (element === null) {
      throw new Error('transcript is not mounted')
    }
    function update() {
      if (element === null) {
        throw new Error('transcript is not mounted')
      }
      const line =
        element.getBoundingClientRect().top + element.clientHeight / 3
      let found: string | null = null
      for (const turn of element.querySelectorAll<HTMLElement>(
        '[data-kind="user"]'
      )) {
        if (found !== null && turn.getBoundingClientRect().top > line) {
          break
        }
        found = turn.dataset.row ?? null
      }
      setActive(found)
    }
    const observer = new ResizeObserver(() => {
      if (element === null) {
        throw new Error('transcript is not mounted')
      }
      const column = element.querySelector('[data-row]')?.parentElement
      if (column === null || column === undefined) {
        return
      }
      setFits(
        element.getBoundingClientRect().right -
          column.getBoundingClientRect().right >=
          40
      )
    })
    update()
    observer.observe(element)
    element.addEventListener('scroll', update, { passive: true })
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', update)
    }
  }, [props.scroller])

  function jump(key: string) {
    props.onJump(key)
    setActive(key)
  }

  return (
    <div
      ref={strip}
      role="toolbar"
      tabIndex={-1}
      aria-orientation="vertical"
      aria-label="Jump between your messages"
      className={cn(
        'absolute top-1/2 right-[calc(var(--app-scrollbar-width)+0.25rem)] z-20 flex max-h-[60%] -translate-y-1/2 flex-col py-1 pointer-coarse:hidden',
        !fits && 'hidden'
      )}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
          return
        }
        event.preventDefault()
        const index = props.turns.findIndex((turn) => turn.key === current)
        const next =
          props.turns[
            Math.min(
              Math.max(index + (event.key === 'ArrowUp' ? -1 : 1), 0),
              props.turns.length - 1
            )
          ]
        jump(next.key)
        strip.current
          ?.querySelector<HTMLElement>(`[data-turn="${CSS.escape(next.key)}"]`)
          ?.focus()
      }}
    >
      {props.turns.map((turn) => (
        <Tooltip key={turn.key} side="left" label={turnPreview(turn.item)}>
          <button
            type="button"
            data-turn={turn.key}
            tabIndex={turn.key === current ? 0 : -1}
            aria-label={`Jump to: ${turnPreview(turn.item)}`}
            className="group/turn focus-visible:ring-ring flex h-3 min-h-1 shrink cursor-pointer items-center justify-end rounded-sm px-1 outline-none focus-visible:ring-2"
            onClick={() => jump(turn.key)}
          >
            <span
              className={cn(
                'h-0.5 rounded-full transition-all duration-150',
                turn.key === current
                  ? 'bg-foreground/70 w-4'
                  : 'bg-foreground/20 group-hover/turn:bg-foreground/45 w-2.5 group-hover/turn:w-4'
              )}
            />
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

export function scrollToRow(element: HTMLDivElement | null, key: string) {
  const row = element?.querySelector(`[data-row="${CSS.escape(key)}"]`)
  if (element === null || !(row instanceof HTMLElement)) {
    throw new Error('that message is not on screen')
  }
  element.scrollTop +=
    row.getBoundingClientRect().top - element.getBoundingClientRect().top - 24
}

function turnPreview(item: UserItem) {
  const firstLine = item.text.trim().split('\n')[0]
  if (firstLine !== '') {
    return firstLine.length > 120 ? `${firstLine.slice(0, 120)}…` : firstLine
  }
  return item.images.length > 0 ? 'Image' : 'Message'
}
