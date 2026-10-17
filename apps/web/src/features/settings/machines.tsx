import { Delete02Icon, Key01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { home } from '@/api/machines'
import { removeMachine } from '@/api/sync'
import { Button } from '@/components/ui/button'
import {
  AddMachineDialog,
  MachineTokenDialog,
} from '@/features/sidebar/machine-dialog'
import { useStore } from '@/lib/store'
import { Section } from './controls'

const statuses = {
  connecting: 'Connecting…',
  online: 'Online',
  offline: 'Offline',
  outdated: 'Runs an older offsite version, update it',
  newer: 'Runs a newer offsite version, reload this page',
  unauthorized: 'Needs its pairing token',
}

export function MachinesPage() {
  const machines = useStore((state) => state.machines)
  const [adding, setAdding] = useState(false)
  const [pairing, setPairing] = useState<string | null>(null)

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
            <Button
              size="icon-sm"
              variant="ghost"
              title="Pairing token"
              onClick={() => setPairing(machine.origin)}
            >
              <HugeiconsIcon icon={Key01Icon} />
            </Button>
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
      {pairing !== null && (
        <MachineTokenDialog origin={pairing} onClose={() => setPairing(null)} />
      )}
    </>
  )
}
