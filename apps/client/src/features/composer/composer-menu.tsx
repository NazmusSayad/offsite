import { FileIcon, SquareSlashIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export type Suggestion = {
  key: string
  label: string
  description: string
  insert: string
}

export function ComposerMenu(props: {
  items: Suggestion[]
  active: number
  onHover: (index: number) => void
  onPick: (item: Suggestion) => void
}) {
  const list = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    list.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [props.active])

  return (
    <div
      ref={list}
      className="composer-glass mx-auto -mb-[calc(1rem+1px)] max-h-72 w-[calc(100%-2.75rem)] overflow-y-auto rounded-t-2xl border border-b-0 border-(--composer-outline) p-1 pb-[calc(1rem+1px+0.25rem)]"
    >
      {props.items.map((item, index) => (
        <button
          key={item.key}
          data-active={index === props.active}
          className={cn(
            'flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left',
            index === props.active && 'bg-accent'
          )}
          onMouseEnter={() => props.onHover(index)}
          onMouseDown={(event) => {
            event.preventDefault()
            props.onPick(item)
          }}
        >
          <HugeiconsIcon
            icon={item.insert.startsWith('/') ? SquareSlashIcon : FileIcon}
            className="text-muted-foreground size-4 shrink-0"
          />
          <span className="shrink-0 text-xs font-medium">{item.label}</span>
          <span className="text-secondary-label min-w-0 truncate text-xs">
            {item.description}
          </span>
        </button>
      ))}
    </div>
  )
}
