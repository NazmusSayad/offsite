import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { home } from '@/machines'
import { AddMachineDialog } from '@/sidebar/machine-dialog'
import { useStore } from '@/store'
import { removeMachine } from '@/sync'
import { Section } from './controls'

const statuses = {
  connecting: 'Connecting…',
  online: 'Online',
  offline: 'Offline',
  outdated: 'Runs another offsite version, update it',
}

export function MachinesPage() {
  const machines = useStore((state) => state.machines)
  const [adding, setAdding] = useState(false)

  return (
    <>
      <Section
        title="Machines"
        note="This browser connects to each one directly. The list stays in this browser"
      >
        {machines.map((machine) => (
          <div
            key={machine.origin}
            className="flex min-h-13 items-center gap-4 px-4 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{machine.name}</p>
              <p className="text-muted-foreground truncate font-mono text-xs">
                {machine.origin}
              </p>
            </div>
            <span className="text-muted-foreground shrink-0 text-xs">
              {machine.origin === home
                ? `${statuses[machine.status]} · serves this page`
                : statuses[machine.status]}
            </span>
            {machine.origin !== home && (
              <Button
                size="icon-sm"
                variant="ghost"
                title="Remove machine"
                onClick={() => removeMachine(machine.origin)}
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            )}
          </div>
        ))}
      </Section>
      <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
        Add machine…
      </Button>
      {adding && <AddMachineDialog onClose={() => setAdding(false)} />}
    </>
  )
}
