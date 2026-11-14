import { StopIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
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
import { stopTask } from '@/lib/sessions'

export type Stopping = { taskId: string; title: string }

export function StopTaskDialog(props: {
  machine: string
  sessionId: string | null
  stopping: Stopping | null
  onClose: () => void
}) {
  const stopping = props.stopping
  return (
    <AlertDialog
      open={stopping !== null}
      onOpenChange={(open) => {
        if (!open) {
          props.onClose()
        }
      }}
    >
      {stopping !== null && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop {stopping.title}?</AlertDialogTitle>
            <AlertDialogDescription>
              It is still running. Do you really want to stop it?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              icon={StopIcon}
              onClick={() => {
                if (props.sessionId === null) {
                  throw new Error('Cannot stop a task without a session')
                }
                stopTask(props.machine, props.sessionId, stopping.taskId)
              }}
            >
              Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}

export function StopIconButton(props: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      className="text-muted-foreground hover:text-destructive focus-visible:ring-ring/70 mr-1.5 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
      onClick={props.onClick}
    >
      <HugeiconsIcon icon={StopIcon} className="size-4" />
    </button>
  )
}

export function StopButton(props: {
  machine: string
  sessionId: string
  taskId: string
}) {
  return (
    <Button
      size="xs"
      variant="outline"
      className="shrink-0"
      onClick={() => stopTask(props.machine, props.sessionId, props.taskId)}
    >
      Stop
    </Button>
  )
}
