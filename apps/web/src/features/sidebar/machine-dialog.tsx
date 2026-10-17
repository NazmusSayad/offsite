import { useState } from 'react'
import { setMachineToken } from '@/api/sync'
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

export function MachineTokenDialog(props: {
  origin: string
  onClose: () => void
}) {
  const [token, setToken] = useState('')

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
            setMachineToken(
              props.origin,
              token.trim() === '' ? null : token.trim()
            )
            props.onClose()
          }}
        >
          <DialogHeader className="gap-1 px-6 pt-4 pr-12">
            <DialogTitle className="text-base">Pairing token</DialogTitle>
            <DialogDescription>
              The pairing token that offsite printed when it started on{' '}
              {props.origin}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 p-6">
            <Input
              aria-label="Pairing token"
              placeholder="Pairing token, empty if auth is off"
              spellCheck={false}
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </div>
          <DialogFooter className="bg-muted/40 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit">Save token</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
