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
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/utils'

export function MoveWorktreeDialog(props: {
  machine: string
  projectId: string
  worktreeId: string | null
  name: string
  onConfirm: (branch: string | null) => void
}) {
  const machine = props.machine
  const projectId = props.projectId
  const worktreeId = props.worktreeId
  const [changes, setChanges] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [branch, setBranch] = useState(props.name)

  useEffect(() => {
    call(machine, 'sessions.moveChanges', { projectId, worktreeId }).then(
      setChanges,
      (caught: unknown) => setError(errorMessage(caught))
    )
  }, [machine, projectId, worktreeId])

  function confirm() {
    props.onConfirm(branch.trim() === '' ? null : branch.trim())
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Move chat to a new worktree?</AlertDialogTitle>
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
      <Input
        aria-label="Branch name"
        placeholder="Branch name, empty to generate one"
        spellCheck={false}
        autoComplete="off"
        value={branch}
        onChange={(event) => setBranch(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            confirm()
          }
        }}
      />
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction icon={NewWorktreeIcon} onClick={confirm}>
          Move chat
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}
