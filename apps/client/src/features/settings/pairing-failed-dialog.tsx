import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { update, useStore } from '@/lib/store'

export function PairingFailedDialog() {
  const failed = useStore((state) => state.pairingFailure !== null)

  return (
    <AlertDialog
      open={failed}
      onOpenChange={(open) => {
        if (!open) {
          update({ pairingFailure: null })
        }
      }}
    >
      <AlertDialogContent focus="action">
        <PairingFailed />
      </AlertDialogContent>
    </AlertDialog>
  )
}

function PairingFailed() {
  const failure = useStore((state) => state.pairingFailure)

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>The pairing link failed</AlertDialogTitle>
        <AlertDialogDescription
          className="line-clamp-6 wrap-anywhere"
          title={failure ?? undefined}
        >
          {failure}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogAction>OK</AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
