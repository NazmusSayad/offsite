import {
  ChevronDownIcon,
  CloudUploadIcon,
  GitCommitHorizontalIcon,
  GitPullRequestIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitStatus } from '@server/protocol'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { call } from '@/connection'
import { providerNames } from '@/lib/format'
import { errorMessage } from '@/lib/utils'
import { machineKey } from '@/machines'
import { getState, showError, useStore } from '@/store'

export function useGitStatus(
  machine: string,
  cwd: string | null,
  running: boolean
) {
  const [result, setResult] = useState<{
    key: string
    status: GitStatus | null
  } | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (cwd === null || running) return
    let current = true
    call(machine, 'git.status', { cwd }).then((status) => {
      if (current) setResult({ key: machineKey(machine, cwd), status })
    }, showError)
    function refresh() {
      setVersion((value) => value + 1)
    }
    window.addEventListener('focus', refresh)
    return () => {
      current = false
      window.removeEventListener('focus', refresh)
    }
  }, [machine, cwd, running, version])

  return {
    status:
      result !== null && cwd !== null && result.key === machineKey(machine, cwd)
        ? result.status
        : null,
    setStatus: (status: GitStatus | null) =>
      setResult(
        cwd === null ? null : { key: machineKey(machine, cwd), status }
      ),
    refresh: () => setVersion((value) => value + 1),
  }
}

export function GitActions(props: {
  machine: string
  cwd: string
  status: GitStatus
  onStatus: (status: GitStatus | null) => void
  onRefresh: () => void
}) {
  const status = props.status
  const [committing, setCommitting] = useState(false)
  const [busy, setBusy] = useState(false)
  const canPush = status.upstream === null || status.ahead > 0

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      showError(error)
    } finally {
      setBusy(false)
      props.onRefresh()
    }
  }

  function push() {
    void run(async () => {
      props.onStatus(await call(props.machine, 'git.push', { cwd: props.cwd }))
    })
  }

  function pullRequest() {
    void run(async () => {
      const result = await call(props.machine, 'git.pullRequest', {
        cwd: props.cwd,
      })
      window.open(result.url, '_blank', 'noopener')
    })
  }

  const primary =
    status.changed > 0
      ? {
          label: 'Commit',
          icon: <HugeiconsIcon icon={GitCommitHorizontalIcon} />,
          run: () => setCommitting(true),
        }
      : canPush
        ? {
            label: 'Push',
            icon: <HugeiconsIcon icon={CloudUploadIcon} />,
            run: push,
          }
        : {
            label: 'Create PR',
            icon: <HugeiconsIcon icon={GitPullRequestIcon} />,
            run: pullRequest,
          }

  return (
    <>
      <div className="flex w-fit">
        <Button
          variant="outline"
          size="xs"
          className="rounded-e-none border-e-0"
          disabled={busy}
          onClick={primary.run}
        >
          {primary.icon}
          <span className="hidden sm:inline">{primary.label}</span>
        </Button>
        <div className="bg-input dark:bg-input/32 w-px" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              className="rounded-s-none border-s-0"
              disabled={busy}
              aria-label="Git actions"
            >
              <HugeiconsIcon icon={ChevronDownIcon} className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              {status.upstream ?? 'No upstream branch'}
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={status.changed === 0}
              onSelect={() => setCommitting(true)}
            >
              <HugeiconsIcon icon={GitCommitHorizontalIcon} />
              Commit {status.changed}{' '}
              {status.changed === 1 ? 'change' : 'changes'}…
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!canPush} onSelect={push}>
              <HugeiconsIcon icon={CloudUploadIcon} />
              Push
              {status.ahead > 0 && (
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  ↑{status.ahead}
                </span>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={pullRequest}>
              <HugeiconsIcon icon={GitPullRequestIcon} />
              Create pull request
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CommitDialog
        machine={props.machine}
        cwd={props.cwd}
        open={committing}
        onClose={() => setCommitting(false)}
        onDone={(next) => {
          props.onStatus(next)
          setCommitting(false)
        }}
      />
    </>
  )
}

function CommitDialog(props: {
  machine: string
  cwd: string
  open: boolean
  onClose: () => void
  onDone: (status: GitStatus | null) => void
}) {
  const provider = useStore((state) => state.settings.provider)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'generate' | 'commit' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function act(kind: 'generate' | 'commit', andPush: boolean) {
    setBusy(kind)
    setError(null)
    try {
      if (kind === 'generate') {
        const result = await call(props.machine, 'git.message', {
          provider: getState().settings.provider,
          accountId: getState().settings.accountId,
          cwd: props.cwd,
        })
        setMessage(result.message)
        return
      }
      const committed = await call(props.machine, 'git.commit', {
        cwd: props.cwd,
        message,
      })
      setMessage('')
      props.onDone(
        andPush
          ? await call(props.machine, 'git.push', { cwd: props.cwd })
          : committed
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={() => props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Commit changes</DialogTitle>
          <DialogDescription>
            Stages every change in {props.cwd} and commits it.
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Commit message"
          rows={5}
          className="bg-background focus:border-ring/60 w-full resize-none rounded-lg border px-3 py-2 font-mono text-xs outline-none"
        />
        {error !== null && (
          <p className="text-destructive text-xs whitespace-pre-wrap">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void act('generate', false)}
          >
            <HugeiconsIcon icon={SparklesIcon} />
            {busy === 'generate'
              ? 'Writing…'
              : `Write with ${providerNames[provider]}`}
          </Button>
          <span className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null || message.trim() === ''}
            onClick={() => void act('commit', true)}
          >
            Commit and push
          </Button>
          <Button
            size="sm"
            disabled={busy !== null || message.trim() === ''}
            onClick={() => void act('commit', false)}
          >
            Commit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
