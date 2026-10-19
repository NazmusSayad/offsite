import {
  AlertCircleIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState, useSyncExternalStore } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn, errorMessage } from '@/lib/utils'
import type { Draft } from './pull-request-form'

const stateIcons = {
  working: CircleDashedIcon,
  done: CircleCheckIcon,
  failed: AlertCircleIcon,
}

type Toast = {
  id: number
  state: 'working' | 'done' | 'failed'
  label: string
  error: string
  url: string | null
}

type Target = { machine: string; projectId: string; onRefresh: () => void }

const listeners = new Set<() => void>()
let toast: Toast | null = null
let lastId = 0

function set(next: Toast | null) {
  toast = next
  for (const listener of listeners) {
    listener()
  }
  if (next?.state === 'done') {
    setTimeout(() => {
      if (toast?.id === next.id) {
        set(null)
      }
    }, 5000)
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function showGitToast(
  label: string,
  outcome: { url: string } | { error: string }
) {
  lastId += 1
  set(
    'url' in outcome
      ? { id: lastId, state: 'done', label, error: '', url: outcome.url }
      : { id: lastId, state: 'failed', label, error: outcome.error, url: null }
  )
}

export async function startGitToast(options: {
  labels: { working: string; done: string; failed: string }
  task: () => Promise<string | null>
  onRefresh: () => void
}) {
  lastId += 1
  const id = lastId
  set({
    id,
    state: 'working',
    label: options.labels.working,
    error: '',
    url: null,
  })
  try {
    const url = await options.task()
    if (toast?.id === id) {
      set({ id, state: 'done', label: options.labels.done, error: '', url })
    }
  } catch (error) {
    if (toast?.id === id) {
      set({
        id,
        state: 'failed',
        label: options.labels.failed,
        error: errorMessage(error),
        url: null,
      })
    }
  } finally {
    options.onRefresh()
  }
}

export function startCommit(
  target: Target,
  repo: string,
  message: string,
  push: boolean
) {
  void startGitToast({
    labels: push
      ? {
          working: 'Committing and pushing…',
          done: 'Committed and pushed',
          failed: 'Commit and push failed',
        }
      : { working: 'Committing…', done: 'Committed', failed: 'Commit failed' },
    task: async () => {
      await call(target.machine, 'git.commit', {
        projectId: target.projectId,
        repo,
        message,
        push,
      })
      return null
    },
    onRefresh: target.onRefresh,
  })
}

export function startPullRequest(target: Target, repo: string, draft: Draft) {
  void startGitToast({
    labels: {
      working: 'Creating pull request…',
      done: 'Pull request created',
      failed: "Couldn't create pull request",
    },
    task: async () => {
      const created = await call(target.machine, 'git.createPullRequest', {
        projectId: target.projectId,
        repo,
        base: draft.base,
        head: draft.head,
        title: draft.title,
        body: draft.body,
      })
      return created.url
    },
    onRefresh: target.onRefresh,
  })
}

export function GitToast() {
  const current = useSyncExternalStore(subscribe, () => toast)
  const [viewing, setViewing] = useState(false)
  if (current === null) {
    return null
  }
  return (
    <div className="bg-popover text-popover-foreground flex max-w-80 items-center gap-3 rounded-md border py-2 pr-2 pl-3 shadow-md">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <HugeiconsIcon
          icon={stateIcons[current.state]}
          className={cn(
            'size-4 shrink-0',
            current.state === 'working' && 'animate-spin',
            current.state === 'done' && 'text-success',
            current.state === 'failed' && 'text-destructive'
          )}
        />
        <span className="truncate">{current.label}</span>
      </div>
      {current.url !== null && (
        <Button asChild size="xs" variant="outline">
          <a href={current.url} target="_blank" rel="noopener noreferrer">
            Open
          </a>
        </Button>
      )}
      {current.state === 'failed' && (
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => setViewing(true)}
        >
          View
        </Button>
      )}
      <Button
        type="button"
        size="icon-micro"
        variant="ghost-muted"
        aria-label="Dismiss"
        onClick={() => {
          setViewing(false)
          set(null)
        }}
      >
        <HugeiconsIcon icon={XIcon} className="size-3.5" />
      </Button>
      <Dialog
        open={viewing && current.state === 'failed'}
        onOpenChange={setViewing}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{current.label}</DialogTitle>
          </DialogHeader>
          <pre className="bg-muted/50 max-h-[60vh] overflow-y-auto rounded-lg border p-3 font-mono text-xs break-words whitespace-pre-wrap">
            {current.error}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  )
}
