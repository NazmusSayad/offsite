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
import { Input } from '@/components/ui/input'
import { setOpen as setTerminalOpen } from '@/features/terminal/session'
import { openSession } from '@/lib/sessions'
import {
  getState,
  type MachineSession,
  showError,
  update,
  useStore,
} from '@/lib/store'

export function MoveDialogs() {
  const moving = useStore((state) => state.moving)
  const removing = useStore((state) => state.removingWorktree)
  return (
    <>
      <Dialog
        open={moving !== null}
        onOpenChange={(open) => !open && update({ moving: null })}
      >
        <DialogContent className="sm:max-w-md">
          {moving !== null && <MoveContent session={moving} />}
        </DialogContent>
      </Dialog>
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
    </>
  )
}

function MoveContent(props: { session: MachineSession }) {
  const session = props.session
  const [name, setName] = useState('')
  const [files, setFiles] = useState<string[] | null>(null)
  const [moving, setMoving] = useState(false)

  useEffect(() => {
    call(session.machine, 'sessions.moveChanges', {
      projectId: session.projectId,
    })
      .then(setFiles)
      .catch((error: unknown) => {
        showError(error)
        update({ moving: null })
      })
  }, [session.machine, session.projectId])

  async function move() {
    setMoving(true)
    try {
      const result = await call(session.machine, 'sessions.move', {
        sessionId: session.id,
        name: name.trim() === '' ? null : name.trim(),
      })
      update({ moving: null })
      const selection = getState().selection
      if (
        selection?.machine === session.machine &&
        selection.sessionId === session.id
      ) {
        openSession(
          {
            machine: session.machine,
            projectId: result.projectId,
            sessionId: session.id,
          },
          null,
          true
        )
        if (result.setup) {
          setTerminalOpen(true)
        }
      }
    } catch (error) {
      showError(error)
      setMoving(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Move to a new worktree</DialogTitle>
        <DialogDescription>
          The chat continues in a new worktree made from the current commit.
          Uncommitted changes move with it. The project folder keeps its branch.
        </DialogDescription>
      </DialogHeader>
      <Input
        value={name}
        spellCheck={false}
        placeholder="Branch name, or leave empty to name it from the title"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && files !== null && !moving) {
            void move()
          }
        }}
      />
      <div className="text-muted-foreground text-xs">
        {files === null && 'Checking uncommitted changes…'}
        {files !== null && files.length === 0 && 'No uncommitted changes'}
        {files !== null && files.length > 0 && (
          <>
            <p className="mb-1">
              {files.length === 1
                ? '1 uncommitted file moves'
                : `${files.length} uncommitted files move`}
            </p>
            <ul className="max-h-40 overflow-y-auto font-mono">
              {files.map((file) => (
                <li key={file} className="truncate" title={file}>
                  {file}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => update({ moving: null })}>
          Cancel
        </Button>
        <Button disabled={files === null || moving} onClick={() => void move()}>
          {moving ? 'Moving…' : 'Move'}
        </Button>
      </DialogFooter>
    </>
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
                <li key={risk} className="break-words">
                  {risk}
                </li>
              ))}
            </ul>
          </>
        )}
        {details !== null && details.branch !== null && (
          <p className="text-muted-foreground mt-2 text-xs">
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
