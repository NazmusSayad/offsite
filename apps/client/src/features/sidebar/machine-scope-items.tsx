import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu'
import { MachineLogo } from '@/constants/machine-icons'
import { useStore } from '@/lib/store'

export function MachineScopeItems(props: {
  scope: string
  onScope: (scope: string) => void
}) {
  const machines = useStore((state) => state.machines)
  return (
    <DropdownMenuRadioGroup value={props.scope} onValueChange={props.onScope}>
      <DropdownMenuRadioItem value="all">All machines</DropdownMenuRadioItem>
      {machines.map((machine) => (
        <DropdownMenuRadioItem
          key={machine.id}
          value={machine.id}
          disabled={machine.status !== 'online'}
        >
          <MachineLogo icon={machine.icon} className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{machineLabel(machine)}</span>
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  )
}

function machineLabel(machine: { name: string; status: string }) {
  if (machine.status === 'online') {
    return machine.name
  }
  if (machine.status === 'unpaired') {
    return `${machine.name} · needs pairing`
  }
  return `${machine.name} · offline`
}
