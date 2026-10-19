import {
  ArrowDataTransferVerticalIcon,
  ArrowDown02Icon,
  ArrowUp02Icon,
  CheckIcon,
  CircleDashedIcon,
  CloudUploadIcon,
  GitBranchIcon,
  PlusSignIcon,
  SearchIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { showError } from '@/lib/store'
import { cn } from '@/lib/utils'

type BranchTarget = {
  machine: string
  projectId: string
  repo: GitRepo
  onRefresh: () => void
}

const touch = window.matchMedia('(pointer: coarse)')

export function BranchPicker(props: BranchTarget) {
  const [open, setOpen] = useState(false)
  const action = syncAction(props.repo)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-muted-foreground hover:text-foreground hidden max-w-48 cursor-pointer items-center gap-1 text-xs sm:flex"
          title="Switch or create a branch"
        >
          <HugeiconsIcon
            icon={action === null ? GitBranchIcon : action.icon}
            className="size-3.5 shrink-0"
          />
          <span className="truncate">{props.repo.branch ?? 'detached'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-86.5 w-72 flex-col">
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
  const [branches, setBranches] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')
  const [switching, setSwitching] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const action = syncAction(target.repo)
  const name = query.trim()
  const matches = (branches ?? []).filter((branch) =>
    branch.toLowerCase().includes(name.toLowerCase())
  )
  const exists = (branches ?? []).includes(name)

  useEffect(() => {
    call(machine, 'git.localBranches', { projectId, repo: repoPath }).then(
      setBranches,
      showError
    )
    call(machine, 'git.fetch', { projectId }).then(onRefresh, showError)
  }, [machine, projectId, repoPath, onRefresh])

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
            disabled={switching}
            className="placeholder:text-muted-foreground/70 h-6.5 w-full bg-transparent ps-5 text-sm outline-none"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || name === '' || branches === null) {
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
        {matches.map((branch) => (
          <button
            key={branch}
            disabled={switching}
            className={cn(
              'hover:bg-accent hover:text-accent-foreground mb-0.5 flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-default disabled:opacity-50',
              branch === target.repo.branch &&
                'text-foreground bg-foreground/[0.08]'
            )}
            onClick={() => {
              if (branch === target.repo.branch) {
                props.onClose()
                return
              }
              void switchTo(branch, false)
            }}
          >
            <span className="min-w-0 flex-1 truncate">{branch}</span>
            {branch === target.repo.branch && (
              <HugeiconsIcon
                icon={CheckIcon}
                strokeWidth={2.25}
                className="size-3.5 shrink-0"
              />
            )}
          </button>
        ))}
        {branches !== null && name !== '' && !exists && (
          <button
            disabled={switching}
            className="hover:bg-accent hover:text-accent-foreground flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm disabled:cursor-default disabled:opacity-50"
            onClick={() => void switchTo(name, true)}
          >
            <HugeiconsIcon icon={PlusSignIcon} className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              Create branch <span className="font-medium">{name}</span>
            </span>
          </button>
        )}
      </div>
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

export function syncAction(repo: GitRepo) {
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
