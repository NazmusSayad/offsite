import { useRef, useState, useSyncExternalStore } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { dismissClosing, getClosing, subscribeClosing } from './close-tab'
import { send } from './session'
import { focusTerminal } from './shortcuts'

export function RenameDialog(props: {
  id: number
  name: string
  onDone: () => void
}) {
  const [name, setName] = useState(props.name)

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onDone()
      }}
    >
      <DialogContent onCloseAutoFocus={restoreFocus}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            send({ type: 'renameTab', id: props.id, name: name.trim() })
            props.onDone()
          }}
        >
          <DialogHeader>
            <DialogTitle>Rename tab</DialogTitle>
          </DialogHeader>
          <Input
            aria-label="Name"
            placeholder="Use terminal title"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={props.onDone}>
              Cancel
            </Button>
            <Button type="submit">Rename</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CloseDialog() {
  const dialog = useSyncExternalStore(subscribeClosing, getClosing)
  const closeButton = useRef<HTMLButtonElement>(null)
  if (dialog === null) return null
  const closing = dialog.closing

  return (
    <AlertDialog
      open={dialog.open}
      onOpenChange={(open) => {
        if (!open) dismissClosing()
      }}
    >
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          closeButton.current?.focus()
        }}
        onCloseAutoFocus={restoreFocus}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Close “{closing.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {closing.program === null
              ? 'offsite couldn’t check whether a program is still running.'
              : `${closing.program} is still running.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            ref={closeButton}
            variant="destructive"
            onClick={() => send({ type: 'closeTab', id: closing.id })}
          >
            Close
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function restoreFocus(event: Event) {
  event.preventDefault()
  const dialog = document.querySelector<HTMLElement>(
    '[role="dialog"], [role="alertdialog"]'
  )
  if (dialog === null) focusTerminal()
  else dialog.focus()
}
