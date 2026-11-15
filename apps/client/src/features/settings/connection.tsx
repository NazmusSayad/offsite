import {
  Add01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  Link01Icon,
  Refresh01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Reorder, useDragControls } from 'motion/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  connectAddresses,
  editMachine,
  pairMachine,
  readMachineLink,
  reconnectMachine,
  removeMachine,
} from '@/api/machines'
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
import { fullTime, providerNames } from '@/lib/format'
import { type Machine, showSettingsPage } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'
import { Row, Section, TextInput } from './controls'
import { MachineIconPicker } from './machine-icon-picker'
import { ServiceButton } from './service'

export function ConnectionPage(props: { machine: Machine }) {
  const machine = props.machine
  const [adding, setAdding] = useState(false)
  const [pairing, setPairing] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [order, setOrder] = useState<string[] | null>(null)
  const addresses = order ?? machine.addresses
  const locked = machine.addresses.some(
    (address) => connectAddresses !== null && connectAddresses.includes(address)
  )
  const newAddress = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding) {
      newAddress.current?.focus()
    }
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

  async function savePairing(text: string) {
    setError(null)
    const trimmed = text.trim()
    if (trimmed === '') {
      return true
    }
    try {
      const code = trimmed.includes('#')
        ? readMachineLink(trimmed).code
        : trimmed
      if (code === null) {
        throw new Error('That link has no pairing code')
      }
      await pairMachine(machine.id, code)
      return true
    } catch (failure) {
      setError(errorMessage(failure))
      return false
    }
  }

  return (
    <>
      <Section title="Status">
        <Row
          label={
            <span className="flex items-center gap-2.5">
              <MachineStatusDot status={machine.status} />
              <span className="min-w-0 truncate">
                {machineStatuses[machine.status]}
                {machine.status === 'online' &&
                  machine.via !== null &&
                  machine.via !== machine.addresses[0] && (
                    <span className="text-muted-foreground font-normal">
                      {' '}
                      · via {new URL(machine.via).host}
                    </span>
                  )}
              </span>
            </span>
          }
        >
          <Button
            size="sm"
            variant="outline"
            title="Reconnect, trying the first address first"
            onClick={() => reconnectMachine(machine.id)}
          >
            <HugeiconsIcon icon={Refresh01Icon} />
            Reconnect
          </Button>
        </Row>
        {machine.system !== null && (
          <Row label="Version">
            <span className="text-muted-foreground text-sm">
              {machine.system.version}
            </span>
          </Row>
        )}
        {machine.providers
          .filter((item) => item.state === 'error')
          .map((item) => (
            <p
              key={item.provider}
              className="text-destructive px-4 py-3 text-xs wrap-anywhere"
            >
              {providerNames[item.provider]} threads: {item.error}
            </p>
          ))}
      </Section>
      <Section title="Appearance" note="Only in this browser">
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
        <MachineIconPicker machine={machine} />
      </Section>
      {!locked && (
        <Section title="Pairing">
          <div className="flex min-h-13 items-center justify-between gap-4 px-4 py-2.5">
            {machine.pairedAt !== null && machine.status !== 'unpaired' && (
              <span className="text-sm">
                Paired {fullTime(machine.pairedAt)}
              </span>
            )}
            {(machine.pairedAt === null || machine.status === 'unpaired') && (
              <form
                className="flex flex-1 items-center gap-3"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (await savePairing(pairing)) {
                    setPairing('')
                  }
                }}
              >
                <Input
                  className="flex-1 font-mono"
                  placeholder="Pairing link or code"
                  spellCheck={false}
                  autoComplete="off"
                  value={pairing}
                  onChange={(event) => setPairing(event.target.value)}
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="px-4"
                  disabled={pairing.trim() === ''}
                >
                  <HugeiconsIcon icon={Link01Icon} />
                  Pair
                </Button>
              </form>
            )}
          </div>
        </Section>
      )}
      <Section
        title="Addresses"
        note="OffSite tries them in order whenever it reconnects"
      >
        <Reorder.Group
          as="div"
          axis="y"
          className="divide-y"
          values={addresses}
          onReorder={setOrder}
        >
          {addresses.map((address, index) => (
            <ReorderRow
              key={address}
              value={address}
              disabled={locked}
              onDragEnd={() => {
                if (order !== null) {
                  saveAddresses(order)
                }
                setOrder(null)
              }}
            >
              <TextInput
                className="flex-1 font-mono"
                value={address}
                disabled={locked}
                onCommit={(text) =>
                  saveAddresses(
                    addresses.map((item, at) => (at === index ? text : item))
                  )
                }
              />
              <Button
                size="icon-sm"
                variant="ghost"
                title="Remove address"
                disabled={locked || addresses.length === 1}
                onClick={() =>
                  saveAddresses(addresses.filter((_, at) => at !== index))
                }
              >
                <HugeiconsIcon icon={Delete02Icon} />
              </Button>
            </ReorderRow>
          ))}
        </Reorder.Group>
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
                if (
                  text === '' ||
                  saveAddresses([...machine.addresses, text])
                ) {
                  setAdding(false)
                }
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur()
                }
              }}
            />
          </div>
        )}
        {!adding && !locked && (
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
      {machine.system !== null && machine.system.version !== 'dev' && (
        <div className="flex justify-center">
          <ServiceButton machine={machine.id} />
        </div>
      )}
      {error !== null && (
        <p className="text-destructive px-1 text-xs break-all">{error}</p>
      )}
      {!locked && (
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
                This browser forgets the machine. Nothing on the machine is
                deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                icon={Delete02Icon}
                onClick={() => {
                  showSettingsPage('General')
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

export const machineStatuses = {
  connecting: 'Connecting…',
  online: 'Online',
  offline: 'Offline',
  unpaired: 'Needs pairing',
}

export function MachineStatusDot(props: { status: Machine['status'] }) {
  return (
    <span
      className={cn(
        'size-2 shrink-0 rounded-full',
        props.status === 'online' && 'bg-success',
        props.status === 'unpaired' && 'bg-warning',
        props.status === 'offline' && 'bg-muted-foreground/40',
        props.status === 'connecting' &&
          'bg-muted-foreground/40 animate-pulse motion-reduce:animate-none'
      )}
    />
  )
}

export function ReorderRow(props: {
  value: string
  disabled: boolean
  className?: string
  onDragEnd: () => void
  children: ReactNode
}) {
  const controls = useDragControls()

  return (
    <Reorder.Item
      as="div"
      value={props.value}
      dragListener={false}
      dragControls={controls}
      onDragEnd={props.onDragEnd}
      className={cn(
        'bg-background relative flex items-center gap-3 px-4 py-2.5',
        props.className
      )}
    >
      <span
        className={cn(
          'text-muted-foreground hover:text-foreground cursor-grab touch-none active:cursor-grabbing',
          props.disabled && 'pointer-events-none opacity-50'
        )}
        title="Drag to reorder"
        onPointerDown={(event) => controls.start(event)}
      >
        <HugeiconsIcon icon={DragDropVerticalIcon} className="size-4" />
      </span>
      {props.children}
    </Reorder.Item>
  )
}
