import { SquareSlashIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SlashCommand } from '@offsite/core/providers'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { FileTypeIcon } from '@/components/file-icon'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { logger } from '@/lib/log'
import { machineOf, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  composerCaret,
  composerRect,
  insertComposerMarker,
  replaceComposerText,
} from './composer-input'

const log = logger.withTag('composer')

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

export function useProjectFiles(
  machine: string,
  projectId: string,
  worktreeId: string | null
) {
  const status = useStore((state) => machineOf(state, machine).status)
  const [files, setFiles] = useState<string[]>([])

  useEffect(() => {
    if (status !== 'online') {
      return
    }
    let current = true
    call(machine, 'files.list', { projectId, worktreeId }).then(
      (list) => {
        if (current) {
          setFiles(list)
        }
      },
      (error: unknown) => log.error('could not list files', error)
    )
    return () => {
      current = false
    }
  }, [machine, projectId, worktreeId, status])

  return files
}

export type Suggestions = ReturnType<typeof useSuggestions>

export function useSuggestions(options: {
  draft: string
  text: string
  caret: number
  commands: SlashCommand[]
  files: string[]
}) {
  const [active, setActive] = useState(0)
  const [closed, setClosed] = useState(false)
  const before = options.text.slice(0, options.caret)
  const trigger = /(?:^|\s)([/@]\S*)$/.exec(before)?.[1] ?? null
  const items =
    trigger === null || closed
      ? []
      : suggestionsFor(
          trigger,
          options.commands.filter(
            (command) => before === trigger || command.inline
          ),
          options.files
        )
  const activeIndex = Math.min(active, items.length - 1)

  function pick(item: Suggestion) {
    if (trigger === null) {
      return
    }
    const start = options.caret - trigger.length
    if (item.insert.startsWith('@')) {
      insertComposerMarker(options.draft, start, options.caret, item.insert)
      return
    }
    replaceComposerText(options.draft, start, options.caret, `${item.insert} `)
  }

  return {
    draft: options.draft,
    items,
    active: activeIndex,
    anchor: trigger === null ? null : options.caret - trigger.length,
    hover: setActive,
    pick,
    close: () => setClosed(true),
    reset: () => {
      setActive(0)
      setClosed(false)
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (items.length === 0) {
        return false
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActive((activeIndex + step + items.length) % items.length)
        return true
      }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        pick(items[activeIndex])
        return true
      }
      if (event.key === 'Escape') {
        setClosed(true)
        return true
      }
      return false
    },
  }
}

export function ComposerMenu(props: { suggestions: Suggestions }) {
  const suggestions = props.suggestions
  const draft = suggestions.draft
  const start = suggestions.anchor
  const anchor = useMemo(
    () => ({
      current: {
        getBoundingClientRect: () =>
          composerRect(draft, start ?? composerCaret(draft)),
      },
    }),
    [draft, start]
  )
  return (
    <Popover
      open={suggestions.items.length > 0}
      onOpenChange={(open) => {
        if (!open) {
          suggestions.close()
        }
      }}
    >
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        side="top"
        className="data-open:zoom-in-100! data-[side=bottom]:slide-in-from-top-0! data-[side=top]:slide-in-from-bottom-0! w-80 max-w-[calc(100vw-1rem)] duration-50 data-closed:animate-none"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <SuggestionList
          items={suggestions.items}
          active={suggestions.active}
          onHover={suggestions.hover}
          onPick={suggestions.pick}
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
