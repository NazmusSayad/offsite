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
  const [address, setAddress] = useState('')
  const [token, setToken] = useState('')
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
            const value = token.trim() === '' ? null : token.trim()
            try {
              if (props.origin === undefined) addMachine(address, value)
              else setMachineToken(props.origin, value)
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
                ? 'The address of another machine running offsite, as this browser reaches it, and the pairing token it printed when it started.'
                : `The pairing token that offsite printed when it started on ${props.origin}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 p-6">
            {props.origin === undefined && (
              <Input
                placeholder="http://my-laptop:47841"
                spellCheck={false}
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            )}
            <Input
              placeholder="Pairing token, empty if auth is off"
              spellCheck={false}
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
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
              disabled={props.origin === undefined && address.trim() === ''}
            >
              {props.origin === undefined ? 'Add machine' : 'Save token'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
