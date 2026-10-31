import {
  AlarmClockIcon,
  Menu01Icon,
  MinimizeIcon,
  Plug01Icon,
  PlugZapIcon,
  Settings01Icon,
  SquareTerminalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NewTerminalItems } from '@/features/terminal/new-terminal-button'
import { showSettings, useStore } from '@/lib/store'

export type ThreadFilter = 'active' | 'snoozed' | 'minimized' | 'inactive'

export function MobileMenu(props: {
  className: string
  filter: ThreadFilter
  onFilter: (filter: ThreadFilter) => void
  onTerminal: () => void
}) {
  const active = useStore((state) =>
    state.machines.some(
      (machine) => machine.status === 'online' && machine.terminals.length > 0
    )
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={props.className} title="Menu" aria-label="Menu">
          <HugeiconsIcon icon={Menu01Icon} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuRadioGroup value={props.filter}>
          {(
            [
              ['active', PlugZapIcon],
              ['snoozed', AlarmClockIcon],
              ['minimized', MinimizeIcon],
              ['inactive', Plug01Icon],
            ] as const
          ).map(([filter, icon]) => (
            <DropdownMenuRadioItem
              key={filter}
              value={filter}
              className="capitalize"
              onSelect={() => props.onFilter(filter)}
            >
              <HugeiconsIcon icon={icon} />
              {filter}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {active ? (
          <DropdownMenuItem onSelect={props.onTerminal}>
            <HugeiconsIcon icon={SquareTerminalIcon} />
            Terminal
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuLabel>Terminal</DropdownMenuLabel>
            <NewTerminalItems />
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => showSettings(true)}>
          <HugeiconsIcon icon={Settings01Icon} />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
