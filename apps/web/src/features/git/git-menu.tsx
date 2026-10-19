import {
  ArrowDataTransferVerticalIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  CloudUploadIcon,
  GitBranchIcon,
  GitCommitHorizontalIcon,
  GitPullRequestIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import { isEqual } from 'es-toolkit'
import { useCallback, useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { showError } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  BranchDialog,
  BranchPicker,
  SyncCounts,
  syncAction,
} from './branch-picker'
import { type Action, eligible, GitDialog } from './git-dialog'
import { startCommit, startGitToast } from './git-toast'

const STATUS_REFRESH = 3000
const FETCH_REFRESH = 180_000

export function useGitStatus(
  machine: string,
  projectId: string | null,
  running: boolean
) {
  const [result, setResult] = useState<{
    key: string
    repos: GitRepo[]
  } | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (projectId === null) {
      return
    }
    const key = machineKey(machine, projectId)
    const params = { projectId }
    let current = true
    let loading = false
    let failed = false
    async function load() {
      if (loading) {
        return
      }
      loading = true
      try {
        const repos = await call(machine, 'git.status', params)
        if (!current) {
          return
        }
        failed = false
        setResult((previous) =>
          previous !== null &&
          previous.key === key &&
          isEqual(previous.repos, repos)
            ? previous
            : { key, repos }
        )
      } catch (error) {
        if (current && !failed) {
          failed = true
          showError(error)
        }
      } finally {
        loading = false
      }
    }
    function refresh() {
      if (!document.hidden) {
        void load()
      }
    }
    void load()
    const timer = window.setInterval(refresh, STATUS_REFRESH)
    window.addEventListener('focus', refresh)
    return () => {
      current = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [machine, projectId, running, version])

  useEffect(() => {
    if (projectId === null) {
      return
    }
    const params = { projectId }
    let current = true
    let failed = false
    async function fetchRemote() {
      if (document.hidden) {
        return
      }
      try {
        await call(machine, 'git.fetch', params)
        if (current) {
          failed = false
          setVersion((value) => value + 1)
        }
      } catch (error) {
        if (current && !failed) {
          failed = true
          showError(error)
        }
      }
    }
    void fetchRemote()
    const timer = window.setInterval(fetchRemote, FETCH_REFRESH)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [machine, projectId])

  const refresh = useCallback(() => setVersion((value) => value + 1), [])

  return {
    repos:
      result !== null &&
      projectId !== null &&
      result.key === machineKey(machine, projectId)
        ? result.repos
        : [],
    refresh,
  }
}

type GitTarget = {
  machine: string
  projectId: string
  repos: GitRepo[]
  onRefresh: () => void
}

export function useGitCommands(props: GitTarget) {
  const [action, setAction] = useState<Action | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [branchRepo, setBranchRepo] = useState<string | null>(null)
  const [committing, setCommitting] = useState(false)
  const pushable = eligible(props.repos, 'push')
  const committable = eligible(props.repos, 'commit')

  function push(repo: string) {
    void startGitToast({
      labels: { working: 'Pushing…', done: 'Pushed', failed: 'Push failed' },
      task: async () => {
        await call(props.machine, 'git.push', {
          projectId: props.projectId,
          repo,
        })
        return null
      },
      onRefresh: props.onRefresh,
    })
  }

  async function yoloCommit() {
    if (committable.length === 1) {
      setMenuOpen(false)
      startCommit(props, committable[0].path, '', false)
      return
    }
    setCommitting(true)
    try {
      for (const repo of committable) {
        await call(props.machine, 'git.commit', {
          projectId: props.projectId,
          repo: repo.path,
          message: '',
          push: false,
        })
      }
      setMenuOpen(false)
    } catch (error) {
      showError(error)
    } finally {
      setCommitting(false)
      props.onRefresh()
    }
  }

  return {
    target: props,
    action,
    setAction,
    menuOpen,
    setMenuOpen,
    branchRepo,
    setBranchRepo,
    committing,
    pushable,
    committable,
    push,
    yoloCommit,
  }
}

type GitCommands = ReturnType<typeof useGitCommands>

export function GitMenuItems(props: { git: GitCommands; collapsed: boolean }) {
  const git = props.git
  const repos = git.target.repos
  const unpushed = repos.reduce((total, repo) => total + repo.ahead, 0)

  return (
    <>
      {props.collapsed &&
        repos.map((repo) => (
          <DropdownMenuItem
            key={repo.path}
            onSelect={() => git.setBranchRepo(repo.path)}
          >
            <HugeiconsIcon icon={GitBranchIcon} />
            <span className="min-w-0 flex-1 truncate">
              {repo.path === ''
                ? (repo.branch ?? 'detached')
                : `${repo.path}: ${repo.branch ?? 'detached'}`}
            </span>
            <span className="text-muted-foreground flex gap-1 text-xs">
              <SyncCounts behind={repo.behind} ahead={repo.ahead} />
            </span>
          </DropdownMenuItem>
        ))}
      {props.collapsed && <DropdownMenuSeparator />}
      {props.collapsed && (
        <DropdownMenuItem
          disabled={git.committable.length === 0}
          onSelect={() => git.setAction('commit')}
        >
          <HugeiconsIcon icon={GitCommitHorizontalIcon} />
          Commit…
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        disabled={git.pushable.length === 0 || git.committing}
        onSelect={() => {
          if (git.pushable.length === 1) {
            git.push(git.pushable[0].path)
            return
          }
          git.setAction('push')
        }}
      >
        <HugeiconsIcon icon={CloudUploadIcon} />
        {git.pushable.length > 1 ? 'Just Push…' : 'Just Push'}
        {unpushed > 0 && (
          <span className="text-muted-foreground ml-auto text-xs tabular-nums">
            ↑{unpushed}
          </span>
        )}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={git.committable.length === 0 || git.committing}
        onSelect={(event) => {
          event.preventDefault()
          void git.yoloCommit()
        }}
      >
        <HugeiconsIcon
          icon={git.committing ? CircleDashedIcon : GitCommitHorizontalIcon}
          className={cn(git.committing && 'animate-spin')}
        />
        {git.committing ? 'Committing…' : 'Yolo Commit'}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={eligible(repos, 'pullRequest').length === 0}
        onSelect={() => git.setAction('pullRequest')}
      >
        <HugeiconsIcon icon={GitPullRequestIcon} />
        Create pull request…
      </DropdownMenuItem>
    </>
  )
}

export function GitCommandDialog(props: { git: GitCommands }) {
  const git = props.git
  const branchRepo = git.target.repos.find(
    (repo) => repo.path === git.branchRepo
  )

  return (
    <>
      {git.action !== null && (
        <GitDialog
          machine={git.target.machine}
          projectId={git.target.projectId}
          action={git.action}
          repos={git.target.repos}
          onClose={() => git.setAction(null)}
          onRefresh={git.target.onRefresh}
        />
      )}
      {git.branchRepo !== null && branchRepo !== undefined && (
        <BranchDialog
          machine={git.target.machine}
          projectId={git.target.projectId}
          repo={branchRepo}
          onRefresh={git.target.onRefresh}
          onClose={() => git.setBranchRepo(null)}
        />
      )}
    </>
  )
}

export function GitActions(props: GitTarget) {
  const git = useGitCommands(props)
  const [syncing, setSyncing] = useState(false)
  const branches = [
    ...new Set(props.repos.map((repo) => repo.branch ?? 'detached')),
  ]
  const unsynced = props.repos.flatMap((repo) => {
    const next = syncAction(repo)
    return next === null ? [] : [{ repo, next }]
  })
  const branchesTitle = props.repos
    .map((repo) =>
      repo.path === ''
        ? (repo.branch ?? 'detached')
        : `${repo.path}: ${repo.branch ?? 'detached'}`
    )
    .join('\n')
  const branchesLabel =
    branches.length === 1 ? branches[0] : `${branches.length} branches`

  async function sync(repo: string) {
    setSyncing(true)
    try {
      await call(props.machine, 'git.sync', {
        projectId: props.projectId,
        repo,
      })
    } catch (error) {
      showError(error)
    } finally {
      setSyncing(false)
      props.onRefresh()
    }
  }

  return (
    <div className="flex w-fit items-center gap-3.5">
      {props.repos.length === 1 && (
        <BranchPicker
          machine={props.machine}
          projectId={props.projectId}
          repo={props.repos[0]}
          onRefresh={props.onRefresh}
        />
      )}
      {props.repos.length > 1 && unsynced.length === 0 && (
        <span
          className="text-muted-foreground hidden max-w-48 items-center gap-1 text-xs sm:flex"
          title={branchesTitle}
        >
          <HugeiconsIcon icon={GitBranchIcon} className="size-3.5 shrink-0" />
          <span className="truncate">{branchesLabel}</span>
        </span>
      )}
      {props.repos.length > 1 && unsynced.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="text-muted-foreground hover:text-foreground hidden max-w-48 cursor-pointer items-center gap-1 text-xs sm:flex"
              title={branchesTitle}
            >
              <HugeiconsIcon
                icon={
                  syncing
                    ? CircleDashedIcon
                    : unsynced.length === 1
                      ? unsynced[0].next.icon
                      : ArrowDataTransferVerticalIcon
                }
                className={cn('size-3.5 shrink-0', syncing && 'animate-spin')}
              />
              <span className="truncate">{branchesLabel}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {unsynced.map((item) => (
              <DropdownMenuItem
                key={item.repo.path}
                disabled={syncing}
                onSelect={() => void sync(item.repo.path)}
              >
                <HugeiconsIcon icon={item.next.icon} />
                <span className="min-w-0 flex-1 truncate">
                  {item.next.label} ·{' '}
                  {item.repo.path === '' ? item.repo.branch : item.repo.path}
                </span>
                <span className="text-muted-foreground flex gap-1 text-xs">
                  <SyncCounts
                    behind={item.repo.behind}
                    ahead={item.repo.ahead}
                  />
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <div className="flex w-fit">
        <Button
          variant="outline"
          size="xs"
          className="rounded-e-none border-e-0"
          disabled={git.committable.length === 0}
          onClick={() => git.setAction('commit')}
        >
          <HugeiconsIcon icon={GitCommitHorizontalIcon} />
          <span className="hidden sm:inline">Commit</span>
        </Button>
        <DropdownMenu open={git.menuOpen} onOpenChange={git.setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              className="rounded-s-none"
              aria-label="Git actions"
            >
              <HugeiconsIcon
                icon={git.committing ? CircleDashedIcon : ChevronDownIcon}
                className={cn('size-4', git.committing && 'animate-spin')}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <GitMenuItems git={git} collapsed={false} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <GitCommandDialog git={git} />
    </div>
  )
}
