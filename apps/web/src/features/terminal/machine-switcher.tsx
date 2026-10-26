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
          {current.terminals > 0 && (
            <span className="text-foreground grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
              {current.terminals}
            </span>
          )}
          {machines.length > 1 && (
            <HugeiconsIcon icon={ChevronDownIcon} className="size-3 shrink-0" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto">
        <DropdownMenuRadioGroup value={props.machine}>
          {machines.map((machine) => (
            <DropdownMenuRadioItem
              key={machine.id}
              value={machine.id}
              onSelect={() => openTerminalPage(machine.id)}
            >
              <HugeiconsIcon icon={machineIcons[machine.icon]} />
              <span className="max-w-60 truncate">{machine.name}</span>
              {machine.terminals > 0 && (
                <span className="text-foreground ml-auto grid h-4 min-w-4 place-items-center rounded-full bg-[color-mix(in_srgb,var(--foreground)_22%,var(--background))] px-1 text-[10px] leading-none font-medium tabular-nums">
                  {machine.terminals}
                </span>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
