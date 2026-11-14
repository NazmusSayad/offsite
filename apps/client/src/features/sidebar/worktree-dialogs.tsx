import type { WorktreeDetails } from '@offsite/core/git'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { showError, update, useStore } from '@/lib/store'

export function MoveDialogs() {
  const removing = useStore((state) => state.removingWorktree)
  return (
    <Dialog
      open={removing !== null}
      onOpenChange={(open) => !open && update({ removingWorktree: null })}
    >
      <DialogContent className="sm:max-w-md">
        {removing !== null && (
          <RemoveContent
            machine={removing.machine}
            projectId={removing.projectId}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RemoveContent(props: { machine: string; projectId: string }) {
  const [details, setDetails] = useState<WorktreeDetails | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    call(props.machine, 'projects.worktreeDetails', {
      projectId: props.projectId,
    })
      .then(setDetails)
      .catch((error: unknown) => {
        showError(error)
        update({ removingWorktree: null })
      })
  }, [props.machine, props.projectId])

  async function remove() {
    setDeleting(true)
    try {
      await call(props.machine, 'projects.removeWorktree', {
        projectId: props.projectId,
      })
      update({ removingWorktree: null })
    } catch (error) {
      showError(error)
      setDeleting(false)
    }
  }

  const risks =
    details === null
      ? []
      : [
          details.changes > 0 &&
            (details.changes === 1
              ? '1 uncommitted change'
              : `${details.changes} uncommitted changes`),
          details.branch === null &&
            details.commits > 0 &&
            (details.commits === 1
              ? '1 commit that is on no branch'
              : `${details.commits} commits that are on no branch`),
          details.ignored.length > 0 &&
            `Ignored files: ${details.ignored.slice(0, 5).join(', ')}${details.ignored.length > 5 ? ` and ${details.ignored.length - 5} more` : ''}`,
        ].filter((item) => item !== false)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete the worktree too?</DialogTitle>
        <DialogDescription>
          No chats are left in{' '}
          {details === null ? 'this worktree' : details.folder}.
        </DialogDescription>
      </DialogHeader>
      <div className="text-sm">
        {details === null && (
          <p className="text-muted-foreground">Checking the worktree…</p>
        )}
        {details !== null && risks.length === 0 && (
          <p className="text-muted-foreground">Nothing would be lost.</p>
        )}
        {details !== null && risks.length > 0 && (
          <>
            <p className="mb-1">Deleting it loses:</p>
            <ul className="list-disc ps-5">
              {risks.map((risk) => (
                <li key={risk} className="wrap-anywhere">
                  {risk}
                </li>
              ))}
            </ul>
          </>
        )}
        {details !== null && details.branch !== null && (
          <p className="text-muted-foreground mt-2 text-xs wrap-anywhere">
            {details.commits === 0 &&
              `The branch ${details.branch} is deleted too, it has no commits of its own.`}
            {details.commits === 1 &&
              `The branch ${details.branch} and its 1 commit are kept.`}
            {details.commits > 1 &&
              `The branch ${details.branch} and its ${details.commits} commits are kept.`}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => update({ removingWorktree: null })}
        >
          Keep
        </Button>
        <Button
          variant="destructive"
          disabled={details === null || deleting}
          onClick={() => void remove()}
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
      </DialogFooter>
    </>
  )
}
