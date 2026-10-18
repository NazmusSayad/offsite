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

const stateIcons = {
  working: CircleDashedIcon,
  done: CircleCheckIcon,
  failed: AlertCircleIcon,
}

type Entry = {
  path: string
  name: string
  state: 'working' | 'done' | 'failed'
  text: string
}

type Run = { id: number; push: boolean; entries: Entry[] }

const listeners = new Set<() => void>()
let run: Run | null = null
let lastId = 0

function set(next: Run | null) {
  run = next
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function patch(id: number, path: string, change: Partial<Entry>) {
  if (run?.id !== id) {
    return
  }
  const entries = run.entries.map((entry) =>
    entry.path === path ? { ...entry, ...change } : entry
  )
  set({ ...run, entries })
  if (entries.every((entry) => entry.state === 'done')) {
    setTimeout(() => {
      if (run?.id === id) {
        set(null)
      }
    }, 5000)
  }
}

export function startCommit(options: {
  machine: string
  projectId: string
  repos: { path: string; name: string }[]
  message: string
  push: boolean
  onRefresh: () => void
}) {
  lastId += 1
  const id = lastId
  set({
    id,
    push: options.push,
    entries: options.repos.map((repo) => ({
      ...repo,
      state: 'working',
      text:
        options.message.trim() === ''
          ? 'Writing message and committing…'
          : 'Committing…',
    })),
  })
  for (const repo of options.repos) {
    call(options.machine, 'git.commit', {
      projectId: options.projectId,
      repo: repo.path,
      message: options.message,
      push: options.push,
    })
      .then(
        (result) =>
          patch(id, repo.path, {
            state: 'done',
            text: `${options.push ? 'Committed and pushed' : 'Committed'}: ${result.message.split('\n')[0]}`,
          }),
        (error: unknown) =>
          patch(id, repo.path, { state: 'failed', text: errorMessage(error) })
      )
      .finally(options.onRefresh)
  }
}

export function CommitToast() {
  const current = useSyncExternalStore(subscribe, () => run)
  const [viewing, setViewing] = useState(false)
  if (current === null) {
    return null
  }
  const failed = current.entries.filter((entry) => entry.state === 'failed')
  return (
    <div className="bg-popover text-popover-foreground w-80 rounded-lg border p-3 shadow-md">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {current.entries.map((entry) => (
            <div key={entry.path} className="flex items-center gap-2">
              <HugeiconsIcon
                icon={stateIcons[entry.state]}
                className={cn(
                  'size-4 shrink-0',
                  entry.state === 'working' && 'animate-spin',
                  entry.state === 'done' && 'text-success',
                  entry.state === 'failed' && 'text-destructive'
                )}
              />
              {current.entries.length > 1 && (
                <span className="shrink-0 font-medium">{entry.name}</span>
              )}
              <span
                className={cn(
                  'min-w-0 truncate text-xs',
                  entry.state === 'failed'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                )}
              >
                {entry.text}
              </span>
            </div>
          ))}
        </div>
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
      </div>
      {failed.length > 0 && (
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => setViewing(true)}
          >
            View
          </Button>
        </div>
      )}
      <Dialog open={viewing && failed.length > 0} onOpenChange={setViewing}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {current.push ? 'Commit and push failed' : 'Commit failed'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {failed.map((entry) => (
              <div key={entry.path} className="flex flex-col gap-1.5">
                {current.entries.length > 1 && (
                  <p className="font-medium">{entry.name}</p>
                )}
                <pre className="bg-muted/50 rounded-lg border p-3 font-mono text-xs break-words whitespace-pre-wrap">
                  {entry.text}
                </pre>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
