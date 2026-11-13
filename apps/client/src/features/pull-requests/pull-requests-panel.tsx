import {
  GitPullRequestIcon,
  RefreshCwIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  PullRequestFilter,
  PullRequestList,
} from '@offsite/core/pull-requests'
import { useSearch } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { useDebounceValue, useLocalStorage } from 'usehooks-ts'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PanelCloseButton } from '@/features/workspace/panel-close-button'
import { timeAgo } from '@/lib/format'
import { replaceSearch } from '@/lib/url'
import { cn, errorMessage } from '@/lib/utils'
import { ChecksBadge, ReviewBadge, StateIcon } from './pull-request-badges'
import { PullRequestView } from './pull-request-view'

const LIST_REFRESH = 60_000

const segment =
  'text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground dark:aria-pressed:bg-input/72 inline-flex h-6 flex-1 cursor-pointer items-center justify-center rounded-md px-2 text-xs aria-pressed:shadow-xs'

const states: { value: PullRequestFilter['state']; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'merged', label: 'Merged' },
  { value: 'closed', label: 'Closed' },
  { value: 'all', label: 'All' },
]

const scopes: { value: PullRequestFilter['scope']; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'mine', label: 'Created by me' },
  { value: 'review', label: 'Review requested' },
  { value: 'assigned', label: 'Assigned to me' },
]

export function PullRequestsPanel(props: {
  machine: string
  projectId: string
  running: boolean
  onClose: () => void
  mobile: boolean
}) {
  const [repos, setRepos] = useState<{
    paths: string[]
    error: string | null
  } | null>(null)
  const [chosenRepo, setChosenRepo] = useState<string | null>(null)
  const [filter, setFilter] = useLocalStorage<
    Omit<PullRequestFilter, 'search'>
  >('pullRequestFilter', { state: 'open', scope: 'all' })
  const [query, setQuery] = useState('')
  const [search] = useDebounceValue(query, 300)
  const [list, setList] = useState<{
    key: string
    result: PullRequestList | null
    error: string | null
  } | null>(null)
  const [version, setVersion] = useState(0)
  const forced = useRef(false)
  const selected = useSearch({
    from: '__root__',
    select: (search) => search.pull ?? null,
  })
  const repo = chosenRepo ?? repos?.paths[0] ?? null
  const key = JSON.stringify([repo, filter.state, filter.scope, search])

  useEffect(() => {
    let current = true
    call(props.machine, 'git.status', { projectId: props.projectId }).then(
      (result) => {
        if (current) {
          setRepos({
            paths: result
              .filter((item) => item.remote)
              .map((item) => item.path),
            error: null,
          })
        }
      },
      (caught: unknown) => {
        if (current) {
          setRepos({ paths: [], error: errorMessage(caught) })
        }
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, props.projectId])

  useEffect(() => {
    if (repo === null) {
      return
    }
    const target = repo
    const loadKey = JSON.stringify([repo, filter.state, filter.scope, search])
    let current = true
    let loading = false
    async function load() {
      if (loading) {
        return
      }
      loading = true
      const fresh = forced.current
      forced.current = false
      try {
        const result = await call(props.machine, 'pulls.list', {
          projectId: props.projectId,
          repo: target,
          filter: { state: filter.state, scope: filter.scope, search },
          fresh,
        })
        if (current) {
          setList({ key: loadKey, result, error: null })
        }
      } catch (caught) {
        if (current) {
          setList({ key: loadKey, result: null, error: errorMessage(caught) })
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
    const timer = window.setInterval(refresh, LIST_REFRESH)
    window.addEventListener('focus', refresh)
    return () => {
      current = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [
    props.machine,
    props.projectId,
    repo,
    filter.state,
    filter.scope,
    search,
    props.running,
    version,
  ])

  if (selected !== null && repo !== null) {
    return (
      <PullRequestView
        machine={props.machine}
        projectId={props.projectId}
        repo={repo}
        url={selected}
        running={props.running}
        mobile={props.mobile}
        onBack={() => {
          replaceSearch({ pull: undefined })
          setVersion(version + 1)
        }}
        onClose={props.onClose}
      />
    )
  }

  const stale = list !== null && list.key !== key
  const result = list?.result ?? null
  const error = repos?.error ?? (stale ? null : (list?.error ?? null))

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center justify-between gap-2 border-b pr-3 pl-3">
        <div className="flex min-w-0 items-center gap-1">
          <PanelCloseButton mobile={props.mobile} onClick={props.onClose} />
          <span className="text-foreground shrink-0 text-xs font-medium">
            Pull requests
          </span>
          {result !== null && (
            <span className="text-muted-foreground min-w-0 truncate text-xs">
              {result.repo}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {repos !== null && repos.paths.length > 1 && (
            <Select value={repo ?? ''} onValueChange={setChosenRepo}>
              <SelectTrigger size="sm" className="max-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {repos.paths.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => {
              forced.current = true
              setVersion(version + 1)
            }}
          >
            <HugeiconsIcon
              icon={RefreshCwIcon}
              className={cn('size-4', stale && 'animate-spin')}
            />
          </Button>
        </div>
      </div>
      <div className="border-border/60 @container grid shrink-0 gap-2 border-b p-3">
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
          />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder="Search, or label:bug review:approved"
            aria-label="Search pull requests"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2 @sm:flex-row @sm:items-center">
          <div className="bg-input/40 flex min-w-0 items-center rounded-lg p-0.5 @sm:flex-1">
            {states.map((state) => (
              <button
                key={state.value}
                className={segment}
                aria-pressed={filter.state === state.value}
                onClick={() => setFilter({ ...filter, state: state.value })}
              >
                {state.label}
              </button>
            ))}
          </div>
          <Select
            value={filter.scope}
            onValueChange={(value) => {
              const scope = scopes.find((item) => item.value === value)
              if (scope === undefined) {
                throw new Error(`unknown pull request scope ${value}`)
              }
              setFilter({ ...filter, scope: scope.value })
            }}
          >
            <SelectTrigger size="sm" className="w-full @sm:w-40 @sm:shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((scope) => (
                <SelectItem key={scope.value} value={scope.value}>
                  {scope.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {repos !== null && repos.error === null && repos.paths.length === 0 && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            This project has no git repository with a remote.
          </p>
        )}
        {error !== null && (
          <p className="text-muted-foreground p-4 text-center text-xs whitespace-pre-wrap">
            {error}
          </p>
        )}
        {(repos === null || (repos.paths.length > 0 && list === null)) && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            Loading…
          </p>
        )}
        {error === null && result !== null && result.items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            <HugeiconsIcon
              icon={GitPullRequestIcon}
              className="text-muted-foreground/40 size-8"
            />
            <p className="text-muted-foreground text-sm">
              No pull requests match these filters
            </p>
          </div>
        )}
        {result?.items.map((item) => (
          <button
            key={item.number}
            className={cn(
              'hover:bg-accent flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left',
              stale && 'opacity-60'
            )}
            onClick={() => replaceSearch({ pull: item.url })}
          >
            <StateIcon
              state={item.state}
              draft={item.draft}
              className="mt-0.5"
            />
            <div className="grid min-w-0 flex-1 gap-1">
              <div className="flex min-w-0 items-start gap-2">
                <span className="text-foreground min-w-0 flex-1 text-sm leading-snug font-medium">
                  {item.title}
                </span>
                <span className="text-2xs mt-0.5 inline-flex shrink-0 items-center gap-1 font-mono tabular-nums">
                  <span className="text-diff-addition">+{item.additions}</span>
                  <span className="text-diff-deletion">-{item.deletions}</span>
                </span>
              </div>
              <div className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
                <span className="tabular-nums">#{item.number}</span>
                <span>·</span>
                <span>{item.author}</span>
                <span>·</span>
                <span>{timeAgo(item.updatedAt)}</span>
                <ChecksBadge checks={item.checks} />
                <ReviewBadge review={item.review} />
                {item.state === 'OPEN' && item.mergeable === 'CONFLICTING' && (
                  <span className="text-destructive">Conflicts</span>
                )}
                {item.head === result.current && (
                  <span className="bg-info/12 text-info rounded px-1.5 py-px text-[10px] font-medium">
                    Current branch
                  </span>
                )}
                {item.labels.map((label) => (
                  <span
                    key={label.name}
                    className="rounded-full border px-1.5 py-px text-[10px]"
                    style={{
                      borderColor: `#${label.color}80`,
                      color: `#${label.color}`,
                    }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
              <span className="text-muted-foreground/70 min-w-0 truncate font-mono text-[11px]">
                {item.head} → {item.base}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
