import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { MachineForm } from './machine-form'

export function AddMachineDialog(props: { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={() => props.onClose()}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="gap-1 px-6 pt-4 pr-12">
          <DialogTitle className="text-base">Add machine</DialogTitle>
          <DialogDescription>
            Paste the pairing link that OffSite printed when it started.
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
