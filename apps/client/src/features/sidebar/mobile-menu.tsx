import {
  Add01Icon,
  Bookmark02Icon,
  Delete02Icon,
  LimitationIcon,
  Menu01Icon,
  Settings01Icon,
  SquareTerminalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { closeTabs } from '@/features/terminal/close-tab'
import { NewTerminalItems } from '@/features/terminal/new-terminal-button'
import { TerminalGroups } from '@/features/terminal/terminal-page'
import { LastUsageMeter } from '@/features/usage/usage-meters'
import { showBookmarks, showSettings, showUsage, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function MobileMenu(props: { buttonClassName: string }) {
  const machines = useStore((state) => state.machines)
  const [terminalsOpen, setTerminalsOpen] = useState(false)
  const online = machines.filter((machine) => machine.status === 'online')
  const terminals = online.reduce(
    (total, machine) => total + machine.terminals.length,
    0
  )

  return (
    <div className="flex items-center gap-0.75">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(props.buttonClassName, 'size-7 [&>svg]:size-4.5')}
            title="Menu"
            aria-label="Menu"
          >
            <HugeiconsIcon icon={Menu01Icon} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-auto min-w-40"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuItem onSelect={() => showUsage(true)}>
            <HugeiconsIcon icon={LimitationIcon} />
            Usage
            <LastUsageMeter />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => showBookmarks(true)}>
            <HugeiconsIcon icon={Bookmark02Icon} />
            Bookmarks
            <BookmarkCount />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => showSettings(true)}>
            <HugeiconsIcon icon={Settings01Icon} />
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Popover open={terminalsOpen} onOpenChange={setTerminalsOpen}>
        <ContextMenu onOpenChange={(open) => open && setTerminalsOpen(false)}>
          <ContextMenuTrigger asChild disabled={online.length === 0}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  props.buttonClassName,
                  'relative size-7 [&>svg]:size-4.5'
                )}
                title="Terminal"
                aria-label="Terminal"
                disabled={online.length === 0}
              >
                <HugeiconsIcon icon={SquareTerminalIcon} />
                {terminals > 0 && (
                  <span className="text-foreground/75 border-sidebar pointer-events-none absolute -top-0.5 -right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full border bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] px-0.5 text-[9px] leading-none font-medium tabular-nums">
                    {terminals}
                  </span>
                )}
              </button>
            </PopoverTrigger>
          </ContextMenuTrigger>
          <ContextMenuContent
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <TerminalMenuItems />
          </ContextMenuContent>
        </ContextMenu>
        <PopoverContent
          align="start"
          className="w-56 p-1"
          onCloseAutoFocus={(event) => event.preventDefault()}
          onClick={() => setTerminalsOpen(false)}
        >
          <TerminalGroups />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function BookmarkCount() {
  const total = useStore((state) =>
    state.machines
      .filter((machine) => machine.status === 'online')
      .reduce((sum, machine) => sum + machine.bookmarks.length, 0)
  )

  return (
    <span className="bg-foreground/5 text-muted-foreground ms-auto flex h-5 min-w-5 items-center justify-center rounded-[6px] px-1.25 text-[11px] font-medium tabular-nums">
      {total}
    </span>
  )
}

function TerminalMenuItems() {
  const machines = useStore((state) => state.machines)
  const online = machines.filter((machine) => machine.status === 'online')

  return (
    <>
      <ContextMenuSub>
        <ContextMenuSubTrigger>
          <HugeiconsIcon icon={Add01Icon} />
          New terminal
        </ContextMenuSubTrigger>
        <ContextMenuSubContent className="max-h-80 overflow-y-auto">
          <NewTerminalItems contextMenu />
        </ContextMenuSubContent>
      </ContextMenuSub>
      <ContextMenuItem
        variant="destructive"
        disabled={online.every((machine) => machine.terminals.length === 0)}
        onSelect={() =>
          void closeTabs(
            online.flatMap((machine) =>
              machine.terminals.map((tab) => ({
                machine: machine.id,
                id: tab.id,
              }))
            )
          )
        }
      >
        <HugeiconsIcon icon={Delete02Icon} />
        Close All
      </ContextMenuItem>
    </>
  )
}
