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
import { baseName } from '@/features/files/explorer'

export function ConflictPrompt(props: {
  path: string | null
  onCancel: () => void
  onOverwrite: () => void
}) {
  return (
    <AlertDialog
      open={props.path !== null}
      onOpenChange={(open) => {
        if (!open) {
          props.onCancel()
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {`${baseName(props.path ?? '')} changed on disk`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Something else changed this file after you opened it. Overwriting
            replaces that version with yours.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={props.onOverwrite}>
            Overwrite
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function SavePrompt(props: {
  open: boolean
  paths: string[]
  onCancel: () => void
  onFinish: (saving: boolean) => void
}) {
  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open) {
          props.onCancel()
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {props.paths.length === 1
              ? `Do you want to save the changes you made to ${baseName(props.paths[0])}?`
              : `Do you want to save the changes to the following ${props.paths.length} files?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {props.paths.length > 1 &&
              `${props.paths.map(baseName).join(', ')}. `}
            {"Your changes will be lost if you don't save them."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="outline"
            onClick={() => props.onFinish(false)}
          >
            {"Don't Save"}
          </AlertDialogAction>
          <AlertDialogAction onClick={() => props.onFinish(true)}>
            {props.paths.length === 1 ? 'Save' : 'Save All'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
