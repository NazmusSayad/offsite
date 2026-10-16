import { useState } from 'react'
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
import { errorMessage } from '@/lib/utils'
import { addMachine } from '@/sync'

export function AddMachineDialog(props: { onClose: () => void }) {
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)

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
              addMachine(address)
              props.onClose()
            } catch (failure) {
              setError(errorMessage(failure))
            }
          }}
        >
          <DialogHeader className="gap-1 px-6 pt-4 pr-12">
            <DialogTitle className="text-base">Add machine</DialogTitle>
            <DialogDescription>
              The address of another machine running offsite, as this browser
              reaches it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 p-6">
            <Input
              placeholder="http://my-laptop:47841"
              spellCheck={false}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
            {error !== null && (
              <p className="text-destructive text-sm break-all">{error}</p>
            )}
          </div>
          <DialogFooter className="bg-muted/40 border-t px-6 py-4">
            <Button type="button" variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={address.trim() === ''}>
              Add machine
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
