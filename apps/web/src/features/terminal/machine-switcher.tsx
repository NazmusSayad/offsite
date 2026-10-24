import { ChevronDownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { machineIcons } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { openTerminalPage } from '@/lib/sessions'
import { machineOf, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function MachineSwitcher(props: { machine: string; className: string }) {
  const machines = useStore((state) => state.machines)
  const current = useStore((state) => machineOf(state, props.machine))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={machines.length < 2}>
        <button
          className={cn(
            'flex min-w-0 items-center gap-1.5 enabled:cursor-pointer',
            props.className
          )}
        >
          <HugeiconsIcon
            icon={machineIcons[current.icon]}
            className="size-3.5 shrink-0"
          />
          <span className="truncate">{current.name}</span>
          {machines.length > 1 && (
            <HugeiconsIcon icon={ChevronDownIcon} className="size-3 shrink-0" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={props.machine}>
          {machines.map((machine) => (
            <DropdownMenuRadioItem
              key={machine.id}
              value={machine.id}
              onSelect={() => openTerminalPage(machine.id)}
            >
              <HugeiconsIcon icon={machineIcons[machine.icon]} />
              <span className="max-w-60 truncate">{machine.name}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
