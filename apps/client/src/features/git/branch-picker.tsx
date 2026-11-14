import {
  ArrowDataTransferVerticalIcon,
  ArrowDown02Icon,
  ArrowUp02Icon,
  CheckIcon,
  CircleDashedIcon,
  CloudIcon,
  CloudUploadIcon,
  SearchIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import {
  BranchIcon,
  NewBranchIcon,
  WorktreeIcon,
  NewWorktreeIcon,
} from '@offsite/core/icons/git'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { MoreLabel } from '@/components/icons'
import { AlertDialog, AlertDialogContent } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { RemoteBranches, Submenu } from '@/features/git/branch-submenu'
import { MoveWorktreeDialog } from '@/features/git/move-worktree-dialog'
import { setOpen as setTerminalOpen } from '@/features/terminal/session'
import { logger } from '@/lib/log'
import { openSession } from '@/lib/sessions'
import { getState, projectOf, showError, useStore } from '@/lib/store'
import { cn, splitAtLimit, touch } from '@/lib/utils'

const log = logger.withTag('git')

type BranchTarget = {
  machine: string
  projectId: string
  repo: Omit<GitRepo, 'added' | 'removed'>
  onRefresh: () => void
}

export function BranchPicker(props: BranchTarget) {
  const [open, setOpen] = useState(false)
  const action = syncAction(props.repo)
  const worktree = useStore(
    (state) =>
      (projectOf(state, props.machine, props.projectId)?.parentId ?? null) !==
      null
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground hidden max-w-48 cursor-pointer items-center gap-1 text-xs sm:flex"
          title="Switch or create a branch"
        >
          <HugeiconsIcon
            icon={
              action !== null
                ? action.icon
                : worktree
                  ? WorktreeIcon
                  : BranchIcon
            }
            className="size-3.5 shrink-0"
          />
          <span className="truncate">{props.repo.branch ?? 'detached'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-72 flex-col">
        <BranchList target={props} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

export function BranchDialog(props: BranchTarget & { onClose: () => void }) {
  return (
    <Dialog open onOpenChange={props.onClose}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex max-h-[min(30rem,calc(100dvh-2rem))] flex-col gap-0 p-0"
        onOpenAutoFocus={(event) => {
          if (touch.matches) {
            event.preventDefault()
          }
        }}
      >
        <DialogTitle className="sr-only">Switch branch</DialogTitle>
        <BranchList target={props} onClose={props.onClose} />
      </DialogContent>
    </Dialog>
  )
}

function BranchList(props: { target: BranchTarget; onClose: () => void }) {
  const target = props.target
  const machine = target.machine
  const projectId = target.projectId
  const repoPath = target.repo.path
  const onRefresh = target.onRefresh
  const [branches, setBranches] = useState<
    { name: string; local: boolean; worktree: string | null }[] | null
  >(null)
  const [sub, setSub] = useState<'local' | 'remote' | null>(null)
  const [query, setQuery] = useState('')
  const [switching, setSwitching] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const action = syncAction(target.repo)
  const name = query.trim()
  const matches = (branches ?? []).filter((branch) =>
    branch.name.toLowerCase().includes(name.toLowerCase())
  )
  const exists = (branches ?? []).some((branch) => branch.name === name)
  const local = splitAtLimit(
    matches,
    5,
    (branch) => branch.name === target.repo.branch
  )
  const session = useStore((state) =>
    state.sessions.find(
      (item) =>
        item.machine === machine &&
        item.projectId === projectId &&
        item.machine === state.selection?.machine &&
        item.id === state.selection.sessionId
    )
  )
  const scratch = useStore(
    (state) => projectOf(state, machine, projectId)?.scratch === true
  )
  const movable =
    session !== undefined &&
    session.provider === 'claude' &&
    !session.claudeWorktree &&
    !scratch
  const [moving, setMoving] = useState(false)
  const [confirmingMove, setConfirmingMove] = useState(false)

  useEffect(() => {
    call(machine, 'git.localBranches', { projectId, repo: repoPath }).then(
      setBranches,
      (error: unknown) => log.error('could not list branches', error)
    )
    call(machine, 'git.fetch', { projectId }).then(
      onRefresh,
      (error: unknown) => log.error('could not fetch', error)
    )
  }, [machine, projectId, repoPath, onRefresh])

  function busy(branch: string) {
    return (
      (branches ?? []).find((item) => item.name === branch)?.worktree ?? null
    )
  }

  async function sync() {
    setSyncing(true)
    try {
      await call(machine, 'git.sync', { projectId, repo: repoPath })
      props.onClose()
    } catch (error) {
      showError(error)
    } finally {
      setSyncing(false)
      onRefresh()
    }
  }

  async function switchTo(branch: string, create: boolean) {
    setSwitching(true)
    try {
      await call(machine, 'git.switch', {
        projectId,
        repo: repoPath,
        branch,
        create,
      })
      props.onClose()
    } catch (error) {
      showError(error)
    } finally {
      setSwitching(false)
      onRefresh()
    }
  }

  async function move(sessionId: string) {
    setMoving(true)
    try {
      const result = await call(machine, 'sessions.move', {
        sessionId,
        name: name === '' ? null : name,
      })
      props.onClose()
      toast(`Moved this chat to the new worktree ${result.branch}`)
      const selection = getState().selection
      if (selection?.machine === machine && selection.sessionId === sessionId) {
        openSession(
          { machine, projectId: result.projectId, sessionId, pending: null },
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

  function localRow(
    branch: {
      name: string
      local: boolean
      worktree: string | null
    },
    inSubmenu: boolean
  ) {
    return (
      <button
        key={branch.name}
        disabled={switching || branch.worktree !== null}
        title={
          branch.worktree === null
            ? undefined
            : `Open in the worktree ${branch.worktree}. A branch can be open in only one worktree at a time`
        }
        className={cn(
          'hover:bg-accent hover:text-accent-foreground mb-0.5 flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-default disabled:opacity-50',
          branch.name === target.repo.branch &&
            'text-foreground bg-foreground/[0.08]'
        )}
        onMouseEnter={() => {
          if (!inSubmenu) {
            setSub(null)
          }
        }}
        onClick={() => {
          if (branch.name === target.repo.branch) {
            props.onClose()
            return
          }
          void switchTo(branch.name, false)
        }}
      >
        {branch.name === target.repo.branch ? (
          <HugeiconsIcon
            icon={CheckIcon}
            strokeWidth={2.25}
            className="size-3.5 shrink-0"
          />
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{branch.name}</span>
        {branch.worktree !== null && (
          <span className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs">
            <HugeiconsIcon icon={WorktreeIcon} className="size-3.5" />
            In another worktree
          </span>
        )}
        {!branch.local && (
          <span
            className="text-muted-foreground flex shrink-0 items-center gap-1 text-xs"
            title="Not on this machine yet. Switching to it creates it from the remote"
          >
            <HugeiconsIcon icon={CloudIcon} className="size-3.5" />
            Remote
          </span>
        )}
      </button>
    )
  }

  return (
    <>
      <div className="shrink-0 px-3 pt-2.5">
        <div className="border-border/70 focus-within:border-ring relative border-b pb-1.5 transition-colors">
          <HugeiconsIcon
            icon={SearchIcon}
            className="text-muted-foreground/55 pointer-events-none absolute top-1.5 left-0 size-4"
          />
          <input
            value={query}
            placeholder="Search or create a branch..."
            disabled={switching || moving}
            className="placeholder:text-muted-foreground/70 h-6.5 w-full bg-transparent ps-5 text-sm outline-none"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== 'Enter' ||
                name === '' ||
                branches === null ||
                busy(name) !== null
              ) {
                return
              }
              event.preventDefault()
              void switchTo(name, !exists)
            }}
          />
        </div>
      </div>
      {action !== null && (
        <div className="border-border/70 shrink-0 border-b px-2 py-1.5">
          <button
            disabled={syncing || switching}
            className="hover:bg-accent hover:text-accent-foreground flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-default disabled:opacity-50"
            onClick={() => void sync()}
          >
            <HugeiconsIcon
              icon={syncing ? CircleDashedIcon : action.icon}
              className={cn('size-3.5 shrink-0', syncing && 'animate-spin')}
            />
            <span className="min-w-0 flex-1 truncate">{action.label}</span>
            <SyncCounts behind={target.repo.behind} ahead={target.repo.ahead} />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {branches === null && (
          <p className="text-muted-foreground p-2 text-center text-sm">
            Loading branches…
          </p>
        )}
        {branches !== null && matches.length === 0 && name === '' && (
          <p className="text-muted-foreground p-2 text-center text-sm">
            No branches
          </p>
        )}
        {(name === '' ? local.shown : matches).map((branch) =>
          localRow(branch, false)
        )}
        {name === '' && local.more.length > 0 && (
          <Submenu
            open={sub === 'local'}
            onOpenChange={(open) => setSub(open ? 'local' : null)}
            trigger={
              <MoreLabel
                text={`${local.more.length} more branches`}
                className="size-3.5"
              />
            }
          >
            {local.more.map((branch) => localRow(branch, true))}
          </Submenu>
        )}
        {name === '' && branches !== null && (
          <Submenu
            open={sub === 'remote'}
            onOpenChange={(open) => setSub(open ? 'remote' : null)}
            trigger={
              <>
                <HugeiconsIcon icon={CloudIcon} className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">Remote branches</span>
              </>
            }
          >
            <RemoteBranches
              machine={machine}
              projectId={projectId}
              repo={repoPath}
              disabled={(branch) => switching || busy(branch) !== null}
              onSwitch={(branch) => void switchTo(branch, false)}
            />
          </Submenu>
        )}
        {branches !== null && name !== '' && !exists && (
          <button
            disabled={switching}
            className="hover:bg-accent hover:text-accent-foreground flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-default disabled:opacity-50"
            onClick={() => void switchTo(name, true)}
          >
            <HugeiconsIcon icon={NewBranchIcon} className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Create branch <span className="font-medium">{name}</span>
            </span>
          </button>
        )}
      </div>
      {movable && !(name !== '' && exists) && (
        <div className="border-border/70 shrink-0 border-t px-2 py-1.5">
          <button
            disabled={switching || moving}
            className="hover:bg-accent hover:text-accent-foreground flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-default disabled:opacity-50"
            onClick={() => setConfirmingMove(true)}
          >
            <HugeiconsIcon
              icon={moving ? CircleDashedIcon : NewWorktreeIcon}
              className={cn('size-3.5 shrink-0', moving && 'animate-spin')}
            />
            <span className="min-w-0 flex-1 truncate">
              Move chat to new worktree{' '}
              {name !== '' && <span className="font-medium">{name}</span>}
            </span>
          </button>
          <AlertDialog open={confirmingMove} onOpenChange={setConfirmingMove}>
            <AlertDialogContent focus="action">
              <MoveWorktreeDialog
                machine={machine}
                projectId={projectId}
                name={name}
                onConfirm={() => void move(session.id)}
              />
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </>
  )
}

export function SyncCounts(props: { behind: number; ahead: number }) {
  return (
    <>
      {props.behind > 0 && (
        <span className="shrink-0 tabular-nums">↓{props.behind}</span>
      )}
      {props.ahead > 0 && (
        <span className="shrink-0 tabular-nums">↑{props.ahead}</span>
      )}
    </>
  )
}

export function syncAction(repo: BranchTarget['repo']) {
  if (repo.branch === null || !repo.remote) {
    return null
  }
  if (repo.upstream === null) {
    return { icon: CloudUploadIcon, label: 'Publish branch' }
  }
  if (repo.behind > 0 && repo.ahead > 0) {
    return { icon: ArrowDataTransferVerticalIcon, label: 'Pull and push' }
  }
  if (repo.behind > 0) {
    return { icon: ArrowDown02Icon, label: 'Pull commits' }
  }
  if (repo.ahead > 0) {
    return { icon: ArrowUp02Icon, label: 'Push commits' }
  }
  return null
}
