import {
  Add01Icon,
  ArrowRight01Icon,
  Delete02Icon,
  Refresh01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import {
  editMachine,
  home,
  readMachineLink,
  reconnectMachine,
  removeMachine,
} from '@/api/machines'
import { type MachineIcon, machineIcons } from '@/components/icons'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AddMachineDialog } from '@/features/sidebar/machine-dialog'
import { providerNames } from '@/lib/format'
import { type Machine, update, useStore } from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { Row, Section, TextInput } from './controls'

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
  const edited = useStore((state) =>
    state.machines.find((item) => item.id === state.settingsEditedMachine)
  )
  const [adding, setAdding] = useState(false)

  if (edited !== undefined) return <EditMachinePage machine={edited} />

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
              variant="ghost-muted"
              title="Open machine"
              onClick={() => update({ settingsEditedMachine: machine.id })}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} />
            </Button>
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

function EditMachinePage(props: { machine: Machine }) {
  const machine = props.machine
  const serving = home !== null && machine.addresses.includes(home)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const newAddress = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) newAddress.current?.focus()
  }, [adding])

  function saveAddresses(addresses: string[]) {
    setError(null)
    try {
      editMachine(machine.id, {
        addresses: [
          ...new Set(
            addresses.map((address) => readMachineLink(address).address)
          ),
        ],
      })
      return true
    } catch (failure) {
      setError(errorMessage(failure))
      return false
    }
  }

  return (
    <>
      <Section title="Machine">
        <Row label="Name">
          <TextInput
            key={machine.label}
            value={machine.label ?? ''}
            placeholder={machine.hostname}
            onCommit={(label) =>
              editMachine(machine.id, {
                label: label.trim() === '' ? null : label.trim(),
              })
            }
          />
        </Row>
        <div className="flex min-h-13 items-center justify-between gap-4 px-4 py-2.5">
          <span className="text-sm font-medium">Icon</span>
          <div className="flex flex-wrap justify-end gap-1">
            {Object.entries(machineIcons).map((entry) => (
              <Button
                key={entry[0]}
                size="icon-sm"
                variant={entry[0] === machine.icon ? 'default' : 'ghost'}
                title={entry[0]}
                aria-pressed={entry[0] === machine.icon}
                onClick={() =>
                  editMachine(machine.id, { icon: entry[0] as MachineIcon })
                }
              >
                <HugeiconsIcon icon={entry[1]} />
              </Button>
            ))}
          </div>
        </div>
      </Section>
      <Section
        title="Addresses"
        note={
          serving
            ? 'This machine serves this page, so its addresses stay'
            : 'offsite tries them in order whenever it reconnects'
        }
      >
        {machine.addresses.map((address, index) => (
          <div key={address} className="flex items-center gap-3 px-4 py-2.5">
            {serving && (
              <span className="min-w-0 flex-1 truncate font-mono text-sm">
                {address}
              </span>
            )}
            {!serving && (
              <>
                <TextInput
                  className="flex-1 font-mono"
                  value={address}
                  onCommit={(text) =>
                    saveAddresses(
                      machine.addresses.map((item, at) =>
                        at === index ? text : item
                      )
                    )
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="Remove address"
                  disabled={machine.addresses.length === 1}
                  onClick={() =>
                    saveAddresses(
                      machine.addresses.filter((_, at) => at !== index)
                    )
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </>
            )}
          </div>
        ))}
        {adding && (
          <div className="px-4 py-2.5">
            <Input
              ref={newAddress}
              className="font-mono"
              placeholder="http://192.168.1.10:47841"
              spellCheck={false}
              autoComplete="off"
              onBlur={(event) => {
                const text = event.target.value.trim()
                if (text === '' || saveAddresses([...machine.addresses, text]))
                  setAdding(false)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />
          </div>
        )}
        {!serving && !adding && (
          <button
            type="button"
            className="text-muted-foreground hover:bg-muted/50 hover:text-foreground flex w-full items-center gap-2 px-4 py-3 text-sm transition-colors"
            onClick={() => setAdding(true)}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Add address
          </button>
        )}
      </Section>
      {error !== null && (
        <p className="text-destructive px-1 text-xs break-all">{error}</p>
      )}
      {!serving && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="text-destructive">
              Remove machine
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {machine.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This browser forgets the machine. The machine and its threads
                stay untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  update({ settingsEditedMachine: null })
                  removeMachine(machine.id)
                }}
              >
                Remove machine
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
