import {
  LimitationIcon,
  Menu01Icon,
  Settings01Icon,
  SquareTerminalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
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
import { TerminalGroups } from '@/features/terminal/terminal-page'
import { showSettings, showUsage, useStore } from '@/lib/store'
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
    <div className="mr-1.5 flex items-center gap-0.75">
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
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => showSettings(true)}>
            <HugeiconsIcon icon={Settings01Icon} />
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover open={terminalsOpen} onOpenChange={setTerminalsOpen}>
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
