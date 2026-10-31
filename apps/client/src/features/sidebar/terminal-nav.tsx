import {
  ChevronRightIcon,
  SquareTerminalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useLocalStorage } from 'usehooks-ts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  NewTerminalButton,
  NewTerminalItems,
} from '@/features/terminal/new-terminal-button'
import { TerminalGroups } from '@/features/terminal/terminal-page'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function TerminalNav(props: { buttonClassName: string }) {
  const machines = useStore((state) => state.machines)
  const [expanded, setExpanded] = useLocalStorage(
    'terminalGroupsExpanded',
    true
  )
  const terminals = machines.reduce(
    (total, machine) => total + machine.terminals.length,
    0
  )
  const active = machines.some(
    (machine) => machine.status === 'online' && machine.terminals.length > 0
  )
  const online = machines.some((machine) => machine.status === 'online')

  if (machines.length === 0) {
    return null
  }

  return (
    <>
      <div className="group/terminal hover:bg-sidebar-row-hover has-[[data-state=open]]:bg-sidebar-row-hover relative rounded-[var(--control-radius)]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={!online}>
            <button
              className={cn(
                props.buttonClassName,
                'group-hover/terminal:text-sidebar-foreground group-hover/terminal:[&>svg]:text-sidebar-foreground group-has-[[data-state=open]]/terminal:text-sidebar-foreground group-has-[[data-state=open]]/terminal:[&>svg]:text-sidebar-foreground h-8 w-full justify-start gap-2 px-2.5 text-sm',
                active &&
                  '[&>svg]:transition-opacity [&>svg]:delay-200 group-hover/terminal:[&>svg]:opacity-0 group-hover/terminal:[&>svg]:delay-0 pointer-coarse:[&>svg]:opacity-0'
              )}
              title="Terminal"
            >
              <HugeiconsIcon icon={SquareTerminalIcon} />
              Terminal
              {terminals > 0 && (
                <span
                  className={cn(
                    'text-foreground/75 ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums',
                    online &&
                      'group-hover/terminal:invisible group-has-[[data-state=open]]/terminal:invisible',
                    active && 'pointer-coarse:invisible'
                  )}
                >
                  {terminals}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="bottom"
            align="start"
            className="max-h-80 w-(--radix-dropdown-menu-trigger-width) overflow-y-auto"
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <NewTerminalItems />
          </DropdownMenuContent>
        </DropdownMenu>
        {active && (
          <button
            className="text-muted-foreground hover:text-foreground absolute top-1 left-1.5 grid size-6 cursor-pointer place-items-center rounded-md opacity-0 transition-opacity delay-200 group-hover/terminal:opacity-100 group-hover/terminal:delay-0 focus-visible:opacity-100 pointer-coarse:opacity-100"
            aria-label={expanded ? 'Collapse terminals' : 'Expand terminals'}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <HugeiconsIcon
              icon={ChevronRightIcon}
              aria-hidden
              className={cn(
                'size-4 transition-transform duration-200',
                expanded && 'rotate-90'
              )}
            />
          </button>
        )}
        <NewTerminalButton />
      </div>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-200',
          expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
        inert={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
          <TerminalGroups />
        </div>
      </div>
    </>
  )
}
