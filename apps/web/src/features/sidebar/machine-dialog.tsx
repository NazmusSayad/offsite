import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { editMachine, home, readMachineLink } from '@/api/machines'
import { type MachineIcon, machineIcons } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Machine } from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { MachineForm } from './machine-form'

export function AddMachineDialog(props: { onClose: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="gap-1 px-6 pt-4 pr-12">
          <DialogTitle className="text-base">Add machine</DialogTitle>
          <DialogDescription>
            Paste the pairing link that offsite printed when it started.
          </DialogDescription>
        </DialogHeader>
        <MachineForm
          fieldsClassName="p-6"
          onAdded={props.onClose}
          actions={(ready) => (
            <DialogFooter className="bg-muted/40 border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={props.onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!ready}>
                Add machine
              </Button>
            </DialogFooter>
          )}
        />
      </DialogContent>
    </Dialog>
  )
}

export function EditMachineDialog(props: {
  machine: Machine
  onClose: () => void
}) {
  const [label, setLabel] = useState(props.machine.label ?? '')
  const [icon, setIcon] = useState(props.machine.icon)
  const [addresses, setAddresses] = useState(props.machine.addresses.join('\n'))
  const [token, setToken] = useState(props.machine.token ?? '')
  const [error, setError] = useState<string | null>(null)
  const serving = home !== null && props.machine.addresses.includes(home)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <form
          className="grid"
          onSubmit={(event) => {
            event.preventDefault()
            try {
              editMachine(props.machine.id, {
                label: label.trim() === '' ? null : label.trim(),
                icon,
                token: token.trim() === '' ? null : token.trim(),
                ...(!serving && {
                  addresses: [
                    ...new Set(
                      addresses
                        .split('\n')
                        .filter((line) => line.trim() !== '')
                        .map((line) => readMachineLink(line).address)
                    ),
                  ],
                }),
              })
              props.onClose()
            } catch (failure) {
              setError(errorMessage(failure))
            }
          }}
        >
          <DialogHeader className="gap-1 px-6 pt-4 pr-12">
            <DialogTitle className="text-base">Edit machine</DialogTitle>
            <DialogDescription>
              {serving
                ? 'This machine serves this page, so its addresses stay.'
                : 'Offsite tries the addresses in order whenever it reconnects.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 p-6">
            <div className="grid gap-2.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(machineIcons).map((entry) => (
                  <Button
                    key={entry[0]}
                    type="button"
                    size="icon"
                    variant={entry[0] === icon ? 'default' : 'outline'}
                    title={entry[0]}
                    aria-pressed={entry[0] === icon}
                    onClick={() => setIcon(entry[0] as MachineIcon)}
                  >
                    <HugeiconsIcon icon={entry[1]} />
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="machine-name">Name</Label>
              <Input
                id="machine-name"
                placeholder={props.machine.hostname}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            {!serving && (
              <div className="grid gap-2">
                <Label htmlFor="machine-addresses">Addresses</Label>
                <textarea
                  id="machine-addresses"
                  placeholder={
                    'One per line, e.g.\nhttp://192.168.1.10:47841\nhttps://my-tunnel.example.com'
                  }
                  spellCheck={false}
                  autoComplete="off"
                  rows={3}
                  className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 w-full resize-none rounded-lg border bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none focus-visible:ring-3"
                  value={addresses}
                  onChange={(event) => setAddresses(event.target.value)}
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="machine-token">Pairing token</Label>
              <Input
                id="machine-token"
                placeholder="Empty if auth is off"
                spellCheck={false}
                autoComplete="off"
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </div>
            {error !== null && (
              <p className="text-destructive text-sm break-all">{error}</p>
            )}
          </div>
          <DialogFooter className="bg-muted/40 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!serving && addresses.trim() === ''}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
