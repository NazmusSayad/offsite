import {
  Delete02Icon,
  PencilEdit01Icon,
  Refresh01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { home } from '@/api/machines'
import { reconnectMachine, removeMachine } from '@/api/sync'
import { machineIcons } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  AddMachineDialog,
  EditMachineDialog,
} from '@/features/sidebar/machine-dialog'
import { providerNames } from '@/lib/format'
import { type Machine, useStore } from '@/lib/store'
import { Section } from './controls'

const statuses = {
  connecting: 'Connecting…',
  online: 'Online',
  offline: 'Offline',
  outdated: 'Runs an older offsite version, update it',
  newer: 'Runs a newer offsite version, reload this page',
  unauthorized: 'Needs its pairing token',
  mismatch: 'Its address reaches a different machine',
}

export function MachinesPage() {
  const machines = useStore((state) => state.machines)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Machine | null>(null)

  return (
    <>
      <Section
        title="Machines"
        note="This browser connects to each one directly. The list stays in this browser"
      >
        {machines.map((machine) => (
          <div
            key={machine.id}
            className="flex min-h-13 items-center gap-4 px-4 py-2.5"
          >
            <HugeiconsIcon
              icon={machineIcons[machine.icon]}
              className="text-muted-foreground size-5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{machine.name}</p>
              {machine.addresses.map((address) => (
                <p
                  key={address}
                  className="text-muted-foreground truncate font-mono text-xs"
                >
                  {address}
                </p>
              ))}
              {machine.providers
                .filter((item) => item.state === 'error')
                .map((item) => (
                  <p
                    key={item.provider}
                    className="text-destructive truncate text-xs"
                    title={item.error ?? undefined}
                  >
                    {providerNames[item.provider]} threads: {item.error}
                  </p>
                ))}
            </div>
            <span className="text-muted-foreground shrink-0 text-xs">
              {statuses[machine.status]}
              {machine.status === 'online' &&
                machine.via !== null &&
                machine.via !== machine.addresses[0] &&
                ` · via ${new URL(machine.via).host}`}
              {home !== null &&
                machine.addresses.includes(home) &&
                ' · serves this page'}
            </span>
            <Button
              size="icon-sm"
              variant="ghost"
              title="Reconnect, trying the first address first"
              onClick={() => reconnectMachine(machine.id)}
            >
              <HugeiconsIcon icon={Refresh01Icon} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              title="Edit machine"
              onClick={() => setEditing(machine)}
            >
              <HugeiconsIcon icon={PencilEdit01Icon} />
            </Button>
            {(home === null || !machine.addresses.includes(home)) && (
              <Button
                size="icon-sm"
                variant="ghost"
                title="Remove machine"
                onClick={() => removeMachine(machine.id)}
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
      {editing !== null && (
        <EditMachineDialog machine={editing} onClose={() => setEditing(null)} />
      )}
    </>
  )
}
