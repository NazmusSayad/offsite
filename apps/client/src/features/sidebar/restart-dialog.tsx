import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { restartSession } from '@/lib/sessions'
import type { MachineSession } from '@/lib/store'

export function RestartDialog(props: { session: MachineSession }) {
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Restart Claude?</AlertDialogTitle>
        <AlertDialogDescription>
          This stops the agent and kills this thread&apos;s Claude Code process,
          including any background tasks, then starts it again.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onClick={() =>
            restartSession(props.session.machine, props.session.id)
          }
        >
          Restart
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
