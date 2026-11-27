import type { LegendListRef } from '@legendapp/list/react'
import { isEqual } from 'es-toolkit'
import { type RefObject, useEffect, useRef, useState } from 'react'
import type { Row, UserItem } from '@/features/transcript/timeline'
import { cn } from '@/lib/utils'

export function TurnJumper(props: {
  rows: Row[]
  list: RefObject<LegendListRef | null>
  scroller: RefObject<HTMLDivElement | null>
  onJump: (key: string) => void
}) {
  const [visible, setVisible] = useState<string[]>([])
  const [hovered, setHovered] = useState<number | null>(null)
  const [fits, setFits] = useState(true)
  const [area, setArea] = useState({ top: 0, height: 0 })
  const rail = useRef<HTMLDivElement>(null)
  const touch = useRef(false)
  const turns = props.rows.flatMap((row, index) =>
    row.kind === 'user' ? [{ key: row.key, index, item: row.item }] : []
  )
  const current = Math.max(
    turns.findIndex((turn) => turn.key === visible[0]),
    0
  )
  const preview = hovered === null ? null : turns[hovered]
  const reply = preview === null ? '' : replyPreview(props.rows, preview.index)

  useEffect(() => {
    const element = props.scroller.current
    if (element === null) {
      throw new Error('transcript is not mounted')
    }
    let frame = 0
    function update() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const state = props.list.current?.getState()
        if (state === undefined) {
          return
        }
        const next = turns.flatMap((turn, index) => {
          const last = (turns[index + 1]?.index ?? props.rows.length) - 1
          return turn.index <= state.end && last >= state.start
            ? [turn.key]
            : []
        })
        setVisible((previous) => (isEqual(previous, next) ? previous : next))
      })
    }
    const observer = new ResizeObserver(() => {
      if (element === null) {
        throw new Error('transcript is not mounted')
      }
      update()
      setArea({ top: element.offsetTop, height: element.clientHeight })
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
      cancelAnimationFrame(frame)
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scroller, props.list, props.rows])

  if (turns.length < 2) {
    return null
  }

  function indexAt(pointer: number) {
    const box = rail.current?.getBoundingClientRect()
    if (box === undefined) {
      throw new Error('message rail is not mounted')
    }
    const progress = Math.min(Math.max((pointer - box.top) / box.height, 0), 1)
    return Math.round(progress * (turns.length - 1))
  }

  function place(index: number) {
    return `${(index / (turns.length - 1)) * 100}%`
  }

  return (
    <div
      ref={rail}
      className={cn(
        'absolute right-[calc(var(--app-scrollbar-width)+0.25rem)] z-20 w-8 -translate-y-1/2 select-none',
        !fits && 'right-auto left-0 w-6'
      )}
      style={{
        top: area.top + area.height / 2,
        height: Math.min((turns.length - 1) * 10, area.height * 0.6),
      }}
    >
      <button
        type="button"
        aria-label={`Jump to your message: ${promptPreview((preview ?? turns[current]).item)}`}
        className="focus-visible:ring-ring absolute inset-x-0 -inset-y-3 cursor-pointer touch-none rounded-md outline-none focus-visible:ring-2"
        onPointerDown={(event) => {
          touch.current = event.pointerType === 'touch'
          if (touch.current) {
            setHovered(indexAt(event.clientY))
          }
        }}
        onPointerMove={(event) => setHovered(indexAt(event.clientY))}
        onPointerUp={(event) => {
          if (event.pointerType === 'touch') {
            props.onJump(turns[indexAt(event.clientY)].key)
            setHovered(null)
          }
        }}
        onPointerCancel={() => setHovered(null)}
        onPointerLeave={() => setHovered(null)}
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) {
            setHovered((index) => index ?? current)
          }
        }}
        onBlur={() => setHovered(null)}
        onWheel={(event) => {
          if (props.scroller.current === null) {
            throw new Error('transcript is not mounted')
          }
          props.scroller.current.scrollBy({ top: event.deltaY })
        }}
        onClick={(event) => {
          if (event.detail !== 0 && touch.current) {
            return
          }
          const index = event.detail === 0 ? hovered : indexAt(event.clientY)
          if (index === null) {
            throw new Error('no message is selected')
          }
          props.onJump(turns[index].key)
        }}
        onKeyDown={(event) => {
          const index = hovered ?? current
          const next =
            event.key === 'ArrowUp'
              ? index - 1
              : event.key === 'ArrowDown'
                ? index + 1
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? turns.length - 1
                    : null
          if (next === null) {
            return
          }
          event.preventDefault()
          setHovered(Math.min(Math.max(next, 0), turns.length - 1))
        }}
      />
      {turns.map((turn, index) => {
        const distance = hovered === null ? null : Math.abs(index - hovered)
        const seen = visible.includes(turn.key)
        return (
          <span
            key={turn.key}
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute right-1 h-0.5 w-5 origin-right -translate-y-1/2 rounded-full transition-all duration-150 ease-out',
              !fits && 'right-auto left-0.5 w-2.5 origin-left',
              distance === 0
                ? 'bg-foreground/85'
                : seen
                  ? 'bg-foreground/55'
                  : 'bg-foreground/20',
              distance === 0
                ? 'scale-x-100'
                : distance === 1
                  ? 'scale-x-75'
                  : distance === 2
                    ? 'scale-x-[0.55]'
                    : seen
                      ? 'scale-x-50'
                      : 'scale-x-[0.35]'
            )}
            style={{ top: place(index) }}
          />
        )
      })}
      {preview !== null && hovered !== null && (
        <div
          className={cn(
            'bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-98 pointer-events-none absolute right-9 w-80 rounded-xl border p-3 shadow-lg/10 transition-[top,translate] duration-100 ease-out',
            !fits && 'right-auto left-7 w-[min(20rem,calc(100vw-2.5rem))]'
          )}
          style={{
            top: place(hovered),
            translate:
              hovered === 0
                ? '0 -0.75rem'
                : hovered === turns.length - 1
                  ? '0 calc(-100% + 0.75rem)'
                  : '0 -50%',
          }}
        >
          <p className="line-clamp-2 text-sm leading-5 font-medium wrap-anywhere">
            {promptPreview(preview.item)}
          </p>
          {reply !== '' && (
            <p className="text-muted-foreground mt-1 line-clamp-3 text-xs leading-[1.125rem] wrap-anywhere">
              {reply}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function promptPreview(item: UserItem) {
  const text = item.text.replace(/\s+/g, ' ').trim()
  if (text !== '') {
    return text.slice(0, 300)
  }
  return item.images.length > 0 ? 'Image' : 'Message'
}

function replyPreview(rows: Row[], index: number) {
  let reply = ''
  for (const row of rows.slice(index + 1)) {
    if (row.kind === 'user') {
      break
    }
    if (row.kind === 'assistant') {
      reply = row.text
    }
  }
  return reply
    .slice(0, 600)
    .replace(/[#*`>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
