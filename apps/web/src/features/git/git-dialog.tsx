import {
  AlertCircleIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleIcon,
  MinusSignCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import { useEffect, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { projectOf, useStore } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'
import { type Draft, PullRequestForm } from './pull-request-form'

export type Action = 'commit' | 'push' | 'pullRequest'

const stateIcons = {
  working: CircleDashedIcon,
  review: CircleIcon,
  done: CircleCheckIcon,
  failed: AlertCircleIcon,
  skipped: MinusSignCircleIcon,
}

type Entry = {
  path: string
  state: 'working' | 'review' | 'done' | 'failed' | 'skipped'
  text: string
  url: string | null
  draft: Draft | null
}

export function GitDialog(props: {
  machine: string
  projectId: string
  action: Action
  repos: GitRepo[]
  onClose: () => void
  onRefresh: () => void
}) {
  const projectName =
    useStore(
      (state) => projectOf(state, props.machine, props.projectId)?.name
    ) ?? ''
  const [repos] = useState(() => eligible(props.repos, props.action))
  const [selected, setSelected] = useState(() => repos.map((repo) => repo.path))
  const [message, setMessage] = useState('')
  const [asking, setAsking] = useState(
    () =>
      props.action === 'pullRequest' &&
      repos.length === 1 &&
      repos[0].changed > 0
  )
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const started = useRef(false)
  const chosen = repos.filter((repo) => selected.includes(repo.path))
  const dirty = chosen.filter((repo) => repo.changed > 0)

  function patch(repo: string, change: Partial<Entry>) {
    setEntries(
      (previous) =>
        previous?.map((entry) =>
          entry.path === repo ? { ...entry, ...change } : entry
        ) ?? null
    )
  }

  async function step(repo: string, task: () => Promise<void>) {
    try {
      await task()
    } catch (error) {
      patch(repo, { state: 'failed', text: errorMessage(error), draft: null })
    } finally {
      props.onRefresh()
    }
  }

  function start(text: string, task: (repo: string) => Promise<void>) {
    setAsking(false)
    setEntries(
      chosen.map((repo) => ({
        path: repo.path,
        state: 'working',
        text,
        url: null,
        draft: null,
      }))
    )
    for (const repo of chosen) {
      void step(repo.path, () => task(repo.path))
    }
  }

  function commit(andPush: boolean) {
    start(
      message.trim() === '' ? 'Writing message and committing…' : 'Committing…',
      async (repo) => {
        const result = await call(props.machine, 'git.commit', {
          projectId: props.projectId,
          repo,
          message,
          push: andPush,
        })
        patch(repo, {
          state: 'done',
          text: `${andPush ? 'Committed and pushed' : 'Committed'}: ${result.message.split('\n')[0]}`,
        })
      }
    )
  }

  function push() {
    start('Pushing…', async (repo) => {
      await call(props.machine, 'git.push', {
        projectId: props.projectId,
        repo,
      })
      patch(repo, { state: 'done', text: 'Pushed' })
    })
  }

  async function draftPullRequest(
    repo: string,
    commitFirst: boolean,
    base: string | null
  ) {
    patch(repo, {
      state: 'working',
      text: commitFirst
        ? 'Committing local changes and writing pull request…'
        : 'Writing pull request…',
      draft: null,
    })
    const result = await call(props.machine, 'git.pullRequest', {
      projectId: props.projectId,
      repo,
      base,
      commit: commitFirst,
    })
    if (result.kind === 'open') {
      patch(repo, {
        state: 'done',
        text: 'A pull request is already open',
        url: result.url,
      })
      return
    }
    patch(repo, {
      state: 'review',
      text: 'Review and create',
      draft: {
        base: result.base,
        head: result.head,
        branches: result.branches,
        title: result.title,
        body: result.body,
      },
    })
  }

  function pullRequest(commitFirst: boolean) {
    start('Starting…', (repo) =>
      draftPullRequest(
        repo,
        commitFirst && dirty.some((item) => item.path === repo),
        null
      )
    )
  }

  function createPullRequest(repo: string, draft: Draft) {
    void step(repo, async () => {
      patch(repo, {
        state: 'working',
        text: 'Creating pull request…',
        draft: null,
      })
      const created = await call(props.machine, 'git.createPullRequest', {
        projectId: props.projectId,
        repo,
        base: draft.base,
        head: draft.head,
        title: draft.title,
        body: draft.body,
      })
      patch(repo, {
        state: 'done',
        text: 'Created pull request',
        url: created.url,
      })
    })
  }

  useEffect(() => {
    if (
      started.current ||
      props.action !== 'pullRequest' ||
      repos.length !== 1 ||
      repos[0].changed > 0
    ) {
      return
    }
    started.current = true
    pullRequest(false)
  })

  return (
    <Dialog open onOpenChange={() => props.onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {props.action === 'commit' && 'Commit changes'}
            {props.action === 'push' && 'Push'}
            {props.action === 'pullRequest' && 'Create pull request'}
          </DialogTitle>
          <DialogDescription>
            {props.action === 'commit' &&
              (repos.length === 1
                ? 'Stages every change and commits it.'
                : 'Stages every change in the selected repositories and commits it.')}
            {props.action === 'push' &&
              'Pushes the selected repositories to their remote.'}
            {props.action === 'pullRequest' &&
              'AI writes the title and description. You review them before the pull request is created.'}
          </DialogDescription>
        </DialogHeader>

        {entries === null && !asking && (
          <>
            {repos.length === 1 && (
              <p className="text-muted-foreground text-xs">
                {repos[0].branch ?? 'detached'} · {repos[0].changed}{' '}
                {repos[0].changed === 1 ? 'change' : 'changes'}
              </p>
            )}
            {repos.length > 1 && (
              <div className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
                {repos.map((repo) => (
                  <label
                    key={repo.path}
                    className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(repo.path)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, repo.path]
                            : selected.filter((item) => item !== repo.path)
                        )
                      }
                    />
                    <span className="truncate font-medium">
                      {repoName(repo.path, projectName)}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {repo.branch ?? 'detached'}
                    </span>
                    <span className="text-muted-foreground ml-auto shrink-0 text-xs tabular-nums">
                      {props.action === 'push'
                        ? repo.upstream === null
                          ? 'not pushed yet'
                          : `↑${repo.ahead}`
                        : repo.changed > 0 &&
                          `${repo.changed} ${repo.changed === 1 ? 'change' : 'changes'}`}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {props.action === 'commit' && (
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Leave empty to write the message with AI"
                rows={5}
                className="bg-background focus:border-ring/60 w-full resize-none rounded-lg border px-3 py-2 font-mono text-xs outline-none"
              />
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {props.action === 'commit' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={chosen.length === 0}
                    onClick={() => commit(false)}
                  >
                    Commit
                  </Button>
                  <Button
                    size="sm"
                    disabled={chosen.length === 0}
                    onClick={() => commit(true)}
                  >
                    Commit and Push
                  </Button>
                </>
              )}
              {props.action === 'push' && (
                <Button size="sm" disabled={chosen.length === 0} onClick={push}>
                  Push
                </Button>
              )}
              {props.action === 'pullRequest' && (
                <Button
                  size="sm"
                  disabled={chosen.length === 0}
                  onClick={() =>
                    dirty.length > 0 ? setAsking(true) : pullRequest(false)
                  }
                >
                  Create pull request
                </Button>
              )}
            </div>
          </>
        )}

        {asking && (
          <>
            <p>
              You have local changes in{' '}
              {dirty.map((repo) => repoName(repo.path, projectName)).join(', ')}
              . Do you want to commit and push them before creating the pull
              request?
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  repos.length === 1 ? props.onClose() : setAsking(false)
                }
              >
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => pullRequest(false)}
              >
                Continue without them
              </Button>
              <Button size="sm" onClick={() => pullRequest(true)}>
                Commit and continue
              </Button>
            </div>
          </>
        )}

        {entries !== null && (
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
            {entries.map((entry) => {
              const draft = entry.draft
              return (
                <div key={entry.path} className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <HugeiconsIcon
                      icon={stateIcons[entry.state]}
                      className={cn(
                        'mt-0.5 size-4 shrink-0',
                        entry.state === 'working' && 'animate-spin',
                        entry.state === 'review' && 'text-info',
                        entry.state === 'done' && 'text-success',
                        entry.state === 'failed' && 'text-destructive',
                        entry.state === 'skipped' && 'text-muted-foreground'
                      )}
                    />
                    <span className="shrink-0 font-medium">
                      {repoName(entry.path, projectName)}
                    </span>
                    <span
                      className={cn(
                        'min-w-0 text-xs leading-5 break-words whitespace-pre-wrap',
                        entry.state === 'failed'
                          ? 'text-destructive'
                          : 'text-muted-foreground'
                      )}
                    >
                      {entry.text}
                      {entry.url !== null && (
                        <>
                          {' '}
                          <a
                            href={entry.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline hover:underline-offset-2"
                          >
                            {entry.url}
                          </a>
                        </>
                      )}
                    </span>
                  </div>
                  {entry.state === 'review' && draft !== null && (
                    <PullRequestForm
                      draft={draft}
                      onChange={(next) => patch(entry.path, { draft: next })}
                      onBase={(base) =>
                        void step(entry.path, () =>
                          draftPullRequest(entry.path, false, base)
                        )
                      }
                      onSkip={
                        repos.length === 1
                          ? null
                          : () =>
                              patch(entry.path, {
                                state: 'skipped',
                                text: 'Skipped',
                                draft: null,
                              })
                      }
                      onRegenerate={() =>
                        void step(entry.path, () =>
                          draftPullRequest(entry.path, false, draft.base)
                        )
                      }
                      onCreate={() => createPullRequest(entry.path, draft)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function eligible(repos: GitRepo[], action: Action) {
  if (action === 'commit') {
    return repos.filter((repo) => repo.changed > 0)
  }
  if (action === 'push') {
    return repos.filter(
      (repo) =>
        repo.branch !== null && (repo.upstream === null || repo.ahead > 0)
    )
  }
  if (action === 'pullRequest') {
    return repos.filter((repo) => repo.branch !== null)
  }
  throw new Error(`Unknown git action ${String(action)}`)
}

function repoName(path: string, projectName: string) {
  return path === '' ? projectName : path
}
