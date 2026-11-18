import { WifiDisconnected02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useShallow } from 'zustand/shallow'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MachineLogo } from '@/constants/machine-icons'
import { showMachineSettings, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function ConnectionStatus(props: { className: string }) {
  const count = useStore(
    (state) =>
      state.machines.filter(
        (machine) =>
          machine.status === 'offline' || machine.status === 'unpaired'
      ).length
  )
  if (count === 0) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(props.className, 'relative [&>svg]:text-warning')}
          title="Unavailable devices"
          aria-label={`${count} unavailable devices`}
        >
          <HugeiconsIcon icon={WifiDisconnected02Icon} />
          <span className="text-warning border-sidebar pointer-events-none absolute -top-0.5 -right-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full border bg-[color-mix(in_srgb,var(--warning)_16%,var(--background))] px-0.5 text-[9px] leading-none font-medium tabular-nums">
            {count}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-auto min-w-48"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <UnavailableMachines />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UnavailableMachines() {
  const machines = useStore(
    useShallow((state) =>
      state.machines.filter(
        (machine) =>
          machine.status === 'offline' || machine.status === 'unpaired'
      )
    )
  )

  return machines.map((machine) => (
    <DropdownMenuItem
      key={machine.id}
      onSelect={() => showMachineSettings(machine.id)}
    >
      <MachineLogo icon={machine.icon} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{machine.name}</span>
      <span className="text-muted-foreground ms-4 text-xs">
        {machine.status === 'offline' ? 'Not connected' : 'Needs pairing'}
      </span>
    </DropdownMenuItem>
  ))
}
