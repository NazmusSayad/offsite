import { useState } from 'react'
import { addMachine, setMachineToken } from '@/api/sync'
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

export function AddMachineDialog(props: {
  origin?: string
  onClose: () => void
}) {
  const [value, setValue] = useState('')
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
              if (props.origin === undefined) addMachine(value)
              else
                setMachineToken(
                  props.origin,
                  value.trim() === '' ? null : value.trim()
                )
              props.onClose()
            } catch (failure) {
              setError(errorMessage(failure))
            }
          }}
        >
          <DialogHeader className="gap-1 px-6 pt-4 pr-12">
            <DialogTitle className="text-base">
              {props.origin === undefined ? 'Add machine' : 'Pairing token'}
            </DialogTitle>
            <DialogDescription>
              {props.origin === undefined
                ? 'Paste the pairing link that offsite printed, or the address of a machine started with --no-auth.'
                : `The pairing token that offsite printed when it started on ${props.origin}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 p-6">
            <Input
              placeholder={
                props.origin === undefined
                  ? 'Pairing link or address'
                  : 'Pairing token, empty if auth is off'
              }
              spellCheck={false}
              autoComplete="off"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
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
              disabled={props.origin === undefined && value.trim() === ''}
            >
              {props.origin === undefined ? 'Add machine' : 'Save token'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
