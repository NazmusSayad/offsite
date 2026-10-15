import { SearchIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  openSession,
  showPalette,
  showSettings,
  showSettingsPage,
  useStore,
} from '@/store'

type Item = { key: string; label: string; detail: string; run: () => void }

export function Palette() {
  const open = useStore((state) => state.paletteOpen)
  const selection = useStore((state) => state.selection)
  const sessionList = useStore((state) => state.sessions)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const list = useRef<HTMLDivElement>(null)
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)

  const actions: Item[] = [
    ...(selection === null
      ? []
      : [
          {
            key: 'new',
            label: 'New thread',
            detail: selection.cwd,
            run: () => openSession({ cwd: selection.cwd, sessionId: null }),
          },
        ]),
    {
      key: 'accounts',
      label: 'Manage accounts',
      detail: '',
      run: () => showSettingsPage('Accounts'),
    },
    {
      key: 'settings',
      label: 'Settings',
      detail: 'Theme, notifications, keyboard shortcuts',
      run: () => showSettings(true),
    },
  ]
  const sessions: Item[] = sessionList.map((session) => ({
    key: session.id,
    label: session.title,
    detail: `${session.archived ? 'Archived · ' : ''}${session.cwd}`,
    run: () => openSession({ cwd: session.cwd, sessionId: session.id }),
  }))
  const items = [...actions, ...sessions]
    .filter((item) => {
      const text = `${item.label} ${item.detail}`.toLowerCase()
      return words.every((word) => text.includes(word))
    })
    .slice(0, 50)
  const activeIndex = Math.min(active, items.length - 1)

  useLayoutEffect(() => {
    list.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function pick(item: Item) {
    showPalette(false)
    item.run()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        showPalette(open)
        setQuery('')
        setActive(0)
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="top-[20%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search threads</DialogTitle>
        <label className="flex items-center gap-2 border-b px-4">
          <HugeiconsIcon
            icon={SearchIcon}
            className="text-muted-foreground size-4 shrink-0"
          />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const step = event.key === 'ArrowDown' ? 1 : -1
                setActive((activeIndex + step + items.length) % items.length)
              }
              if (event.key === 'Enter' && activeIndex >= 0) {
                event.preventDefault()
                pick(items[activeIndex])
              }
            }}
            placeholder="Search threads and actions…"
            className="placeholder:text-placeholder/75 h-11 w-full bg-transparent text-sm outline-none"
          />
        </label>
        <div ref={list} className="max-h-96 overflow-y-auto p-1">
          {items.length === 0 && (
            <p className="text-muted-foreground px-3 py-6 text-center text-xs">
              Nothing matches.
            </p>
          )}
          {items.map((item, index) => (
            <button
              key={item.key}
              data-active={index === activeIndex}
              className={cn(
                'flex w-full cursor-pointer flex-col rounded-lg px-2.5 py-1.5 text-left',
                index === activeIndex && 'bg-accent'
              )}
              onMouseMove={() => setActive(index)}
              onClick={() => pick(item)}
            >
              <span className="truncate text-sm">{item.label}</span>
              {item.detail !== '' && (
                <span className="text-secondary-label truncate text-xs">
                  {item.detail}
                </span>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
