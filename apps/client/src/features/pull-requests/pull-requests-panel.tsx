import {
  GitPullRequestIcon,
  RefreshCwIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  PullRequestFilter,
  PullRequestList,
  PullRequestMethods,
} from '@offsite/core/pull-requests'
import { uniqBy } from 'es-toolkit'
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
import { Skeleton } from '@/components/ui/skeleton'
import { PanelCloseButton } from '@/features/workspace/panel-close-button'
import { timeAgo } from '@/lib/format'
import { cn, errorMessage } from '@/lib/utils'
import { ChecksBadge, ReviewBadge, StateIcon } from './pull-request-badges'
import {
  listCache,
  loadDetails,
  prefetch,
  summaries,
  useCacheVersion,
} from './pull-request-cache'
import { openFromList } from './pull-request-view'

const LIST_REFRESH = 60_000
const HOVER_DELAY = 150

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
  worktreeId: string | null
  onClose: () => void
  mobile: boolean
}) {
  const [chosenRepo, setChosenRepo] = useState<string | null>(null)
  const [filter, setFilter] = useLocalStorage<
    Omit<PullRequestFilter, 'search'>
  >('pullRequestFilter', { state: 'open', scope: 'all' })
  const [query, setQuery] = useState('')
  const [search] = useDebounceValue(query, 300)
  const [more, setMore] = useState({ base: '', pages: 1 })
  const [shown, setShown] = useState<string | null>(null)
  const [failure, setFailure] = useState<{
    base: string
    message: string
  } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [version, setVersion] = useState(0)
  const forced = useRef(false)
  const hover = useRef<number | undefined>(undefined)
  useCacheVersion(listCache)
  const base = JSON.stringify([
    props.machine,
    props.projectId,
    props.worktreeId,
    chosenRepo,
    filter.state,
    filter.scope,
    search,
  ])
  const pageCount = more.base === base ? more.pages : 1
  const pages = loadedPages(base, pageCount)
  const previous =
    shown === null ? undefined : listCache.get(pageKey(shown, null))
  const result = pages.at(0) ?? previous ?? null
  const stale = pages.length === 0 && previous !== undefined
  const last = pages.at(-1)
  const wanted =
    last !== undefined && last.next !== null && pages.length < pageCount
      ? last.next
      : null
  const items =
    pages.length === 0
      ? (result?.items ?? [])
      : uniqBy(
          pages.flatMap((page) => page.items),
          (item) => item.number
        )
  const error = failure?.base === base ? failure.message : null

  useEffect(() => {
    const params = {
      projectId: props.projectId,
      worktreeId: props.worktreeId,
      repo: chosenRepo,
      filter: { state: filter.state, scope: filter.scope, search },
      after: null,
    }
    let current = true
    async function load(fresh: boolean) {
      try {
        await loadPage(props.machine, base, { ...params, fresh })
        if (current) {
          setShown(base)
          setFailure(null)
        }
      } catch (caught) {
        if (current) {
          setFailure({ base, message: errorMessage(caught) })
        }
      } finally {
        if (current) {
          setRefreshing(false)
        }
      }
    }
    function refresh() {
      if (!document.hidden) {
        void load(false)
      }
    }
    const fresh = forced.current
    forced.current = false
    void load(fresh)
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
    props.worktreeId,
    chosenRepo,
    filter.state,
    filter.scope,
    search,
    base,
    version,
  ])

  useEffect(() => {
    if (wanted === null) {
      return
    }
    let current = true
    async function load(after: string) {
      try {
        await loadPage(props.machine, base, {
          projectId: props.projectId,
          worktreeId: props.worktreeId,
          repo: chosenRepo,
          filter: { state: filter.state, scope: filter.scope, search },
          after,
          fresh: false,
        })
      } catch (caught) {
        if (current) {
          setFailure({ base, message: errorMessage(caught) })
          setMore({ base, pages: pageCount - 1 })
        }
      }
    }
    void load(wanted)
    return () => {
      current = false
    }
  }, [
    props.machine,
    props.projectId,
    props.worktreeId,
    chosenRepo,
    filter.state,
    filter.scope,
    search,
    base,
    wanted,
    pageCount,
  ])

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center gap-2 border-b pr-3 pl-3">
        <div className="flex max-w-1/2 min-w-0 shrink-0 items-center gap-1">
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
        <div className="relative ml-4 min-w-0 flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
          />
          <Input
            className="h-7 pl-8 text-xs"
            placeholder="Search, or label:bug review:approved"
            aria-label="Search pull requests"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {result !== null && result.repos.length > 1 && (
            <Select value={result.path} onValueChange={setChosenRepo}>
              <SelectTrigger size="sm" className="max-w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {result.repos.map((item) => (
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
              setRefreshing(true)
              setVersion(version + 1)
            }}
          >
            <HugeiconsIcon
              icon={RefreshCwIcon}
              className={cn('size-4', (stale || refreshing) && 'animate-spin')}
            />
          </Button>
        </div>
      </div>
      <div className="border-border/60 @container grid shrink-0 gap-2 border-b p-3">
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
        {error !== null && (
          <p className="text-muted-foreground p-4 text-center text-xs wrap-anywhere whitespace-pre-wrap">
            {error}
          </p>
        )}
        {result === null && error === null && (
          <div aria-label="Loading pull requests">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-start gap-2.5 px-2.5 py-2">
                <Skeleton className="mt-0.5 size-4 shrink-0 rounded-full" />
                <div className="grid min-w-0 flex-1 gap-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="ml-auto h-3 w-12" />
                  </div>
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        )}
        {error === null && result !== null && items.length === 0 && (
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
        {items.map((item) => (
          <button
            key={item.number}
            className={cn(
              'hover:bg-accent flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left',
              stale && 'opacity-60'
            )}
            onPointerEnter={() => {
              window.clearTimeout(hover.current)
              hover.current = window.setTimeout(() => {
                prefetch(() => loadDetails(props, item.url, false))
              }, HOVER_DELAY)
            }}
            onPointerLeave={() => window.clearTimeout(hover.current)}
            onClick={() => openFromList(item.url)}
          >
            <StateIcon
              state={item.state}
              draft={item.draft}
              className="mt-0.5"
            />
            <div className="grid min-w-0 flex-1 gap-1">
              <div className="flex min-w-0 items-start gap-2">
                <span className="text-foreground min-w-0 flex-1 text-sm leading-snug font-medium wrap-anywhere">
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
                {result !== null && item.head === result.current && (
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
        {last !== undefined && last.next !== null && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground mt-1 w-full"
            disabled={wanted !== null}
            onClick={() => setMore({ base, pages: pageCount + 1 })}
          >
            {wanted !== null && (
              <HugeiconsIcon
                icon={RefreshCwIcon}
                className="size-3.5 animate-spin"
              />
            )}
            Load more
          </Button>
        )}
      </div>
    </div>
  )
}

function pageKey(base: string, after: string | null) {
  return JSON.stringify([base, after])
}

function loadedPages(base: string, count: number) {
  const pages: PullRequestList[] = []
  let after: string | null = null
  while (pages.length < count) {
    const page = listCache.get(pageKey(base, after))
    if (page === undefined) {
      break
    }
    pages.push(page)
    if (page.next === null) {
      break
    }
    after = page.next
  }
  return pages
}

function loadPage(
  machine: string,
  base: string,
  params: PullRequestMethods['pulls.list']['params']
) {
  return listCache.load(pageKey(base, params.after), params.fresh, async () => {
    const list = await call(machine, 'pulls.list', params)
    for (const item of list.items) {
      summaries.set(item.url, item)
    }
    return list
  })
}
