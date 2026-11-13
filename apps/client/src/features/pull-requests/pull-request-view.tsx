import {
  ArrowLeft01Icon,
  LinkSquare02Icon,
  MoreHorizontalIcon,
  RefreshCwIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  PullRequestAction,
  PullRequestDetails,
} from '@offsite/core/pull-requests'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useLocalStorage } from 'usehooks-ts'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { DiffMenuItems } from '@/features/git/diff-options'
import { PanelCloseButton } from '@/features/workspace/panel-close-button'
import { timeAgo } from '@/lib/format'
import { showError } from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { PullRequestActions } from './pull-request-actions'
import { StateBadge } from './pull-request-badges'
import { PullRequestFiles } from './pull-request-files'
import { PullRequestGuide } from './pull-request-guide'
import { PullRequestOverview } from './pull-request-overview'

const VIEW_REFRESH = 30_000

const segment =
  'text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground dark:aria-pressed:bg-input/72 inline-flex h-6 cursor-pointer items-center justify-center rounded-md px-2.5 text-xs aria-pressed:shadow-xs'

export function PullRequestView(props: {
  machine: string
  projectId: string
  repo: string
  url: string
  running: boolean
  mobile: boolean
  onBack: () => void
  onClose: () => void
}) {
  const [details, setDetails] = useState<PullRequestDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [tab, setTab] = useLocalStorage<
    'overview' | 'guide' | 'files' | 'changes' | 'commits'
  >('pullRequestTab', 'overview')
  const [fullscreen, setFullscreen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const forced = useRef(false)

  useEffect(() => {
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
        const result = await call(props.machine, 'pulls.view', {
          projectId: props.projectId,
          repo: props.repo,
          url: props.url,
          fresh,
        })
        if (current) {
          setDetails(result)
          setError(null)
        }
      } catch (caught) {
        if (current) {
          setError(errorMessage(caught))
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
    const timer = window.setInterval(refresh, VIEW_REFRESH)
    window.addEventListener('focus', refresh)
    return () => {
      current = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [
    props.machine,
    props.projectId,
    props.repo,
    props.url,
    props.running,
    version,
  ])

  async function perform(action: PullRequestAction, label: string) {
    setBusy(label)
    try {
      await call(props.machine, 'pulls.run', {
        projectId: props.projectId,
        repo: props.repo,
        url: props.url,
        action,
      })
      toast(label)
      setVersion((value) => value + 1)
      return true
    } catch (caught) {
      showError(caught)
      return false
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center justify-between gap-2 border-b pr-3 pl-3">
        <div className="flex min-w-0 items-center gap-1">
          <PanelCloseButton
            mobile={props.mobile}
            onClick={props.mobile ? props.onBack : props.onClose}
          />
          {!props.mobile && (
            <Button
              size="icon-sm"
              variant="ghost"
              title="Back to pull requests"
              aria-label="Back to pull requests"
              onClick={props.onBack}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            </Button>
          )}
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            #{props.url.split('/').at(-1)}
            {details !== null && ` ${details.title}`}
          </span>
          {details === null && error === null && (
            <Skeleton className="ml-1 h-3.5 w-48 min-w-0 shrink" />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
            <HugeiconsIcon icon={RefreshCwIcon} className="size-4" />
          </Button>
          {details !== null && (
            <Button size="icon-sm" variant="ghost" asChild>
              <a
                href={details.url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open on GitHub"
                aria-label="Open on GitHub"
              >
                <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
              </a>
            </Button>
          )}
        </div>
      </div>
      {details === null && error !== null && (
        <p className="text-muted-foreground p-4 text-center text-xs whitespace-pre-wrap">
          {error}
        </p>
      )}
      {details === null && error === null && (
        <div aria-label="Loading pull request">
          <div className="border-border/60 grid gap-2.5 border-b p-4">
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-7 w-80 max-w-full rounded-lg" />
          </div>
          <div className="grid gap-2.5 p-4">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="mt-3 h-5 w-1/3" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      )}
      {details !== null && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="border-border/60 grid gap-2.5 border-b p-4">
              <h2 className="text-foreground text-base leading-snug font-semibold">
                <span className="mr-2 inline-flex items-center gap-2 align-text-bottom">
                  <StateBadge state={details.state} draft={details.draft} />
                  <span className="text-muted-foreground font-normal">
                    #{details.number}
                  </span>
                </span>
                {details.title}
              </h2>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                <span>
                  <span className="text-foreground">{details.author}</span>{' '}
                  {details.state === 'OPEN' && 'wants to merge'}
                  {details.state === 'MERGED' && 'merged'}
                  {details.state === 'CLOSED' && 'wanted to merge'}{' '}
                  {details.commits.length}{' '}
                  {details.commits.length === 1 ? 'commit' : 'commits'} into{' '}
                  <code className="bg-muted rounded px-1">{details.base}</code>{' '}
                  from{' '}
                  <code className="bg-muted rounded px-1">{details.head}</code>
                </span>
              </div>
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                <span className="font-mono tabular-nums">
                  <span className="text-diff-addition">
                    +{details.additions}
                  </span>{' '}
                  <span className="text-diff-deletion">
                    -{details.deletions}
                  </span>
                </span>
                <span>·</span>
                <span>
                  {details.changedFiles}{' '}
                  {details.changedFiles === 1 ? 'file' : 'files'}
                </span>
                <span>·</span>
                <span>Updated {timeAgo(details.updatedAt)}</span>
                {details.head === details.current && (
                  <span className="bg-info/12 text-info rounded px-1.5 py-px text-[10px] font-medium">
                    Current branch
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="bg-input/40 flex w-fit items-center rounded-lg p-0.5">
                  <button
                    className={segment}
                    aria-pressed={tab === 'overview'}
                    onClick={() => setTab('overview')}
                  >
                    Overview
                  </button>
                  <button
                    className={segment}
                    aria-pressed={tab === 'guide'}
                    onClick={() => setTab('guide')}
                  >
                    Guidebook
                  </button>
                  <button
                    className={segment}
                    aria-pressed={tab === 'files'}
                    onClick={() => setTab('files')}
                  >
                    Files
                  </button>
                  <button
                    className={segment}
                    aria-pressed={tab === 'changes'}
                    onClick={() => setTab('changes')}
                  >
                    Guided change
                  </button>
                  <button
                    className={segment}
                    aria-pressed={tab === 'commits'}
                    onClick={() => setTab('commits')}
                  >
                    Commits
                  </button>
                </div>
                {(tab === 'files' || tab === 'changes') && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        className="-my-0.5 shrink-0"
                        title="Diff options"
                        aria-label="Diff options"
                      >
                        <HugeiconsIcon
                          icon={MoreHorizontalIcon}
                          className="size-4"
                        />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DiffMenuItems
                        onFullscreen={
                          props.mobile ? null : () => setFullscreen(true)
                        }
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
            {tab === 'overview' && (
              <PullRequestOverview
                details={details}
                busy={busy !== null}
                onPerform={perform}
              />
            )}
            {(tab === 'guide' || tab === 'changes') && (
              <PullRequestGuide
                key={tab}
                machine={props.machine}
                projectId={props.projectId}
                repo={props.repo}
                url={details.url}
                head={details.headOid}
                view={tab === 'guide' ? 'guidebook' : 'changes'}
                title={`#${details.number} ${details.title}`}
                fullscreen={fullscreen}
                onFullscreen={setFullscreen}
              />
            )}
            {tab === 'files' && (
              <PullRequestFiles
                machine={props.machine}
                projectId={props.projectId}
                repo={props.repo}
                url={props.url}
                head={details.headOid}
                title={`#${details.number} ${details.title}`}
                fullscreen={fullscreen}
                onFullscreen={setFullscreen}
                groups={null}
              />
            )}
            {tab === 'commits' && (
              <div className="grid p-2">
                {details.commits.map((commit) => (
                  <div
                    key={commit.hash}
                    className="flex min-w-0 items-baseline gap-2 rounded-lg px-2 py-1.5 text-xs"
                  >
                    <code className="text-muted-foreground shrink-0">
                      {commit.hash.slice(0, 7)}
                    </code>
                    <span className="text-foreground min-w-0 flex-1 truncate">
                      {commit.subject}
                    </span>
                    <span className="text-muted-foreground shrink-0">
                      {commit.author} · {timeAgo(commit.date)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <PullRequestActions
            details={details}
            busy={busy}
            onPerform={perform}
          />
        </>
      )}
      {details !== null && error !== null && (
        <p className="text-destructive border-t px-4 py-2 text-xs">{error}</p>
      )}
    </div>
  )
}
