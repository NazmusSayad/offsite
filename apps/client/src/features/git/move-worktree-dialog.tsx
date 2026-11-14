import { NewWorktreeIcon } from '@offsite/core/icons/git'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { errorMessage } from '@/lib/utils'

export function MoveWorktreeDialog(props: {
  machine: string
  projectId: string
  name: string
  onConfirm: () => void
}) {
  const machine = props.machine
  const projectId = props.projectId
  const [changes, setChanges] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    call(machine, 'sessions.moveChanges', { projectId }).then(
      setChanges,
      (caught: unknown) => setError(errorMessage(caught))
    )
  }, [machine, projectId])

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {props.name === ''
            ? 'Move chat to a new worktree?'
            : `Move chat to the new worktree ${props.name}?`}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {error !== null && `Could not check for uncommitted files: ${error}`}
          {error === null && changes === null && 'Checking uncommitted files…'}
          {changes !== null &&
            changes.length === 0 &&
            'This folder has no uncommitted files.'}
          {changes !== null &&
            changes.length === 1 &&
            '1 uncommitted file moves with the chat and leaves this folder.'}
          {changes !== null &&
            changes.length > 1 &&
            `${changes.length} uncommitted files move with the chat and leave this folder.`}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {changes !== null && changes.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-lg border px-3 py-2 font-mono text-xs">
          {changes.map((file) => (
            <li key={file} className="truncate py-0.5">
              {file}
            </li>
          ))}
        </ul>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction icon={NewWorktreeIcon} onClick={props.onConfirm}>
          Move chat
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
