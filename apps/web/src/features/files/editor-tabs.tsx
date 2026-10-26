import { XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { FileTypeIcon } from '@/components/file-icon'
import { baseName, parentOf } from '@/features/files/explorer'
import { cn } from '@/lib/utils'

export function EditorTabs(props: {
  tabs: { path: string; pinned: boolean }[]
  active: string | null
  dirty: string[]
  onSelect: (path: string) => void
  onPin: (path: string) => void
  onClose: (path: string) => void
}) {
  return (
    <div
      role="tablist"
      className="flex h-full min-w-0 flex-1 [scrollbar-width:thin] overflow-x-auto"
    >
      {props.tabs.map((tab) => {
        const name = baseName(tab.path)
        const selected = tab.path === props.active
        const changed = props.dirty.includes(tab.path)
        return (
          <div
            key={tab.path}
            role="tab"
            tabIndex={0}
            aria-selected={selected}
            title={tab.path}
            className={cn(
              'group/tab border-sidebar-border relative flex shrink-0 cursor-pointer items-center gap-1.5 border-r pr-1.5 pl-3 text-[13px] outline-none select-none',
              selected && 'bg-background text-foreground',
              !selected && 'text-muted-foreground hover:bg-background/50'
            )}
            onClick={() => props.onSelect(tab.path)}
            onDoubleClick={() => props.onPin(tab.path)}
            onAuxClick={(event) => {
              if (event.button === 1) {
                props.onClose(tab.path)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                props.onSelect(tab.path)
              }
            }}
          >
            {selected && (
              <span className="bg-primary absolute inset-x-0 top-0 h-px" />
            )}
            <FileTypeIcon path={tab.path} />
            <span className={cn('max-w-48 truncate', !tab.pinned && 'italic')}>
              {name}
            </span>
            {props.tabs.some(
              (item) => item !== tab && baseName(item.path) === name
            ) && (
              <span className="text-muted-foreground max-w-40 truncate text-xs">
                {parentOf(tab.path)}
              </span>
            )}
            <button
              type="button"
              title="Close"
              aria-label={`Close ${name}`}
              className={cn(
                'group/close hover:bg-accent flex size-5 cursor-pointer items-center justify-center rounded opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100',
                (selected || changed) && 'opacity-100'
              )}
              onClick={(event) => {
                event.stopPropagation()
                props.onClose(tab.path)
              }}
            >
              {changed && (
                <span className="bg-foreground size-2 rounded-full group-hover/close:hidden" />
              )}
              <HugeiconsIcon
                icon={XIcon}
                className={cn(
                  'size-3.5',
                  changed && 'hidden group-hover/close:block'
                )}
              />
            </button>
          </div>
        )
      })}
    </div>
  )
}
