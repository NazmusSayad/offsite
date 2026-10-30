import {
  Add01Icon,
  ArrowRight01Icon,
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
  reorderMachines,
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
import { MachineLogo, machineIcons } from '@/constants/machine-icons'
import { AddMachineDialog } from '@/features/sidebar/machine-dialog'
import { fullTime, providerNames } from '@/lib/format'
import { type Machine, update, useStore } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'
import { Row, Section, TextInput } from './controls'

const statuses = {
  connecting: 'Connecting…',
  online: 'Online',
  offline: 'Offline',
  unpaired: 'Needs pairing',
}

export function MachinesPage() {
  const machines = useStore((state) => state.machines)
  const edited = useStore((state) =>
    state.machines.find((item) => item.id === state.settingsEditedMachine)
  )
  const [adding, setAdding] = useState(false)
  const [order, setOrder] = useState<string[] | null>(null)
  const listed =
    order === null
      ? machines
      : [...machines].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))

  if (edited !== undefined) {
    return <EditMachinePage machine={edited} />
  }

  return (
    <>
      <Section
        title="Machines"
        note="This browser connects to each one directly. The list stays in this browser"
      >
        <Reorder.Group
          as="div"
          axis="y"
          className="divide-y"
          values={listed.map((machine) => machine.id)}
          onReorder={setOrder}
        >
          {listed.map((machine) => (
            <ReorderRow
              key={machine.id}
              value={machine.id}
              disabled={false}
              className="min-h-13 gap-4"
              onDragEnd={() => {
                if (order !== null) {
                  reorderMachines(order)
                }
                setOrder(null)
              }}
            >
              <MachineLogo
                icon={machine.icon}
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
              </span>
              <div className="flex shrink-0 items-center gap-1">
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
            </ReorderRow>
          ))}
        </Reorder.Group>
      </Section>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          Add machine…
        </Button>
      </div>
      {adding && <AddMachineDialog onClose={() => setAdding(false)} />}
    </>
  )
}

function EditMachinePage(props: { machine: Machine }) {
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
        <div className="flex min-h-13 items-start justify-between gap-x-4 gap-y-2 px-4 py-2.5 @max-lg:flex-col">
          <span className="text-sm font-medium">Icon</span>
          <div className="flex w-full max-w-sm min-w-0 flex-col gap-3 @max-lg:max-w-none">
            {[
              ...new Set(Object.values(machineIcons).map((item) => item.group)),
            ].map((group) => (
              <div key={group} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs">{group}</span>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(2rem,1fr))] gap-1">
                  {Object.keys(machineIcons)
                    .filter((icon) => machineIcons[icon].group === group)
                    .map((icon) => (
                      <Button
                        key={icon}
                        title={icon}
                        size="icon-sm"
                        className="aspect-square h-auto! w-full!"
                        aria-pressed={icon === machine.icon}
                        variant={icon === machine.icon ? 'default' : 'ghost'}
                        onClick={() => editMachine(machine.id, { icon })}
                      >
                        <MachineLogo
                          icon={icon}
                          className="block aspect-square! h-auto! w-[66%]! min-w-0! shrink-0!"
                        />
                      </Button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>
      {!locked && (
        <Section title="Pairing">
          <div className="flex min-h-13 items-center justify-between gap-4 px-4 py-2.5">
            {machine.pairedAt !== null && machine.status !== 'unpaired' && (
              <span className="text-sm">
                {machine.pairedAt === null
                  ? 'Paired'
                  : `Paired ${fullTime(machine.pairedAt)}`}
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

function ReorderRow(props: {
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
