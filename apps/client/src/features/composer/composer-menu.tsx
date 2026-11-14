import { SquareSlashIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SlashCommand } from '@offsite/core/providers'
import { useLayoutEffect, useRef } from 'react'
import { FileTypeIcon } from '@/components/file-icon'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { composerRect } from './composer-input'

export type Suggestion = {
  key: string
  label: string
  description: string
  insert: string
}

export function suggestionsFor(
  trigger: string,
  commands: SlashCommand[],
  files: string[]
): Suggestion[] {
  const query = trigger.slice(1).toLowerCase()
  if (trigger.startsWith('/')) {
    return commands
      .filter((command) => command.name.toLowerCase().includes(query))
      .sort(
        (a, b) =>
          Number(!a.name.toLowerCase().startsWith(query)) -
          Number(!b.name.toLowerCase().startsWith(query))
      )
      .map((command) => ({
        key: command.name,
        label: `/${command.name}${command.hint === '' ? '' : ` ${command.hint}`}`,
        description: command.description,
        insert: `/${command.name}`,
      }))
  }
  return files
    .filter((file) => file.toLowerCase().includes(query))
    .slice(0, 50)
    .map((file) => ({
      key: file,
      label: file.split('/').at(-1) ?? file,
      description: file.includes('/')
        ? file.slice(0, file.lastIndexOf('/'))
        : '',
      insert: `@${file}`,
    }))
}

export function ComposerMenu(props: {
  items: Suggestion[]
  active: number
  anchor: number
  onHover: (index: number) => void
  onPick: (item: Suggestion) => void
  onClose: () => void
}) {
  return (
    <Popover
      open={props.items.length > 0}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose()
        }
      }}
    >
      <PopoverAnchor
        virtualRef={{
          current: { getBoundingClientRect: () => composerRect(props.anchor) },
        }}
      />
      <PopoverContent
        side="top"
        className="data-open:zoom-in-100! data-[side=bottom]:slide-in-from-top-0! data-[side=top]:slide-in-from-bottom-0! w-80 max-w-[calc(100vw-1rem)] duration-50 data-closed:animate-none"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <SuggestionList
          items={props.items}
          active={props.active}
          onHover={props.onHover}
          onPick={props.onPick}
        />
      </PopoverContent>
    </Popover>
  )
}

function SuggestionList(props: {
  items: Suggestion[]
  active: number
  onHover: (index: number) => void
  onPick: (item: Suggestion) => void
}) {
  const list = useRef<HTMLDivElement>(null)
  const hovered = useRef<number | null>(null)

  useLayoutEffect(() => {
    if (hovered.current === props.active) {
      hovered.current = null
      return
    }
    list.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [props.active])

  return (
    <div
      ref={list}
      className="max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto p-1"
    >
      {props.items.map((item, index) => (
        <button
          key={item.key}
          data-active={index === props.active}
          className={cn(
            'flex min-h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-left',
            index === props.active && 'bg-accent'
          )}
          onMouseEnter={() => {
            hovered.current = index
            props.onHover(index)
          }}
          onMouseDown={(event) => {
            event.preventDefault()
            props.onPick(item)
          }}
        >
          {item.insert.startsWith('/') && (
            <HugeiconsIcon
              icon={SquareSlashIcon}
              className="text-muted-foreground size-4 shrink-0"
            />
          )}
          {item.insert.startsWith('@') && (
            <FileTypeIcon
              path={item.insert.slice(1)}
              className="size-4 shrink-0"
            />
          )}
          <span className="min-w-0 truncate text-xs font-medium">
            {item.label}
          </span>
          <span className="text-secondary-label min-w-0 flex-1 truncate text-xs">
            {item.description}
          </span>
        </button>
      ))}
    </div>
  )
}
