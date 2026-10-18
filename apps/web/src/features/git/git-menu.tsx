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
import { isEqual, sumBy } from 'es-toolkit'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { showToast } from '@/components/toast'
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
import { BranchPicker, SyncCounts, syncAction } from './branch-picker'
import { type Action, eligible, GitDialog } from './git-dialog'

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

  return {
    repos:
      result !== null &&
      projectId !== null &&
      result.key === machineKey(machine, projectId)
        ? result.repos
        : [],
    refresh: () => setVersion((value) => value + 1),
  }
}

export function GitActions(props: {
  machine: string
  projectId: string
  repos: GitRepo[]
  onRefresh: () => void
}) {
  const [action, setAction] = useState<Action | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const unpushed = props.repos.reduce((total, repo) => total + repo.ahead, 0)
  const branches = [
    ...new Set(props.repos.map((repo) => repo.branch ?? 'detached')),
  ]
  const pushable = eligible(props.repos, 'push')
  const committable = eligible(props.repos, 'commit')
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

  async function push(repo: string) {
    setPushing(true)
    try {
      await call(props.machine, 'git.push', {
        projectId: props.projectId,
        repo,
      })
      setMenuOpen(false)
    } catch (error) {
      showError(error)
    } finally {
      setPushing(false)
      props.onRefresh()
    }
  }

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

  async function yoloCommit() {
    setCommitting(true)
    try {
      for (const repo of committable) {
        const result = await call(props.machine, 'git.commit', {
          projectId: props.projectId,
          repo: repo.path,
          message: '',
          push: false,
        })
        showToast(`Committed: ${result.message.split('\n')[0]}`)
      }
      setMenuOpen(false)
    } catch (error) {
      showError(error)
    } finally {
      setCommitting(false)
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
              <SyncCounts
                behind={sumBy(unsynced, (item) => item.repo.behind)}
                ahead={sumBy(unsynced, (item) => item.repo.ahead)}
              />
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
          disabled={eligible(props.repos, 'commit').length === 0}
          onClick={() => setAction('commit')}
        >
          <HugeiconsIcon icon={GitCommitHorizontalIcon} />
          <span className="hidden sm:inline">Commit</span>
        </Button>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              className="rounded-s-none"
              aria-label="Git actions"
            >
              <HugeiconsIcon
                icon={
                  pushing || committing ? CircleDashedIcon : ChevronDownIcon
                }
                className={cn(
                  'size-4',
                  (pushing || committing) && 'animate-spin'
                )}
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              disabled={pushable.length === 0 || pushing || committing}
              onSelect={(event) => {
                if (pushable.length === 1) {
                  event.preventDefault()
                  void push(pushable[0].path)
                  return
                }
                setAction('push')
              }}
            >
              <HugeiconsIcon
                icon={pushing ? CircleDashedIcon : CloudUploadIcon}
                className={cn(pushing && 'animate-spin')}
              />
              {pushing
                ? 'Pushing…'
                : pushable.length > 1
                  ? 'Just Push…'
                  : 'Just Push'}
              {unpushed > 0 && (
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  ↑{unpushed}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={committable.length === 0 || pushing || committing}
              onSelect={(event) => {
                event.preventDefault()
                void yoloCommit()
              }}
            >
              <HugeiconsIcon
                icon={committing ? CircleDashedIcon : GitCommitHorizontalIcon}
                className={cn(committing && 'animate-spin')}
              />
              {committing ? 'Committing…' : 'Yolo Commit'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={eligible(props.repos, 'pullRequest').length === 0}
              onSelect={() => setAction('pullRequest')}
            >
              <HugeiconsIcon icon={GitPullRequestIcon} />
              Create pull request…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {action !== null && (
        <GitDialog
          machine={props.machine}
          projectId={props.projectId}
          action={action}
          repos={props.repos}
          onClose={() => setAction(null)}
          onRefresh={props.onRefresh}
        />
      )}
    </div>
  )
}
