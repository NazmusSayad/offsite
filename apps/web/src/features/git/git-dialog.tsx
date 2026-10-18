import {
  AlertCircleIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleIcon,
  MinusSignCircleIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import { useEffect, useState } from 'react'
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
import { startCommit } from './commit-toast'
import {
  BaseSelect,
  type Draft,
  PullRequestForm,
  type Target,
} from './pull-request-form'

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
  const [targets, setTargets] = useState<Record<string, Target>>({})
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const chosen = repos.filter(
    (repo) =>
      selected.includes(repo.path) && targets[repo.path]?.kind !== 'failed'
  )
  const loading =
    props.action === 'pullRequest' &&
    chosen.some((repo) => targets[repo.path] === undefined)
  const dirty = chosen.filter((repo) => repo.changed > 0)

  useEffect(() => {
    if (props.action !== 'pullRequest') {
      return
    }
    for (const repo of repos) {
      call(props.machine, 'git.branches', {
        projectId: props.projectId,
        repo: repo.path,
      }).then(
        (result) =>
          setTargets((previous) => ({
            ...previous,
            [repo.path]: { kind: 'ready', ...result },
          })),
        (error: unknown) =>
          setTargets((previous) => ({
            ...previous,
            [repo.path]: { kind: 'failed', text: errorMessage(error) },
          }))
      )
    }
  }, [props.machine, props.projectId, props.action, repos])

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

  function chooseBase(repo: string, base: string) {
    setTargets((previous) => {
      const target = previous[repo]
      if (target?.kind !== 'ready') {
        return previous
      }
      return { ...previous, [repo]: { ...target, base } }
    })
  }

  function start(text: string, task: (repo: string) => Promise<void>) {
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
    startCommit({
      machine: props.machine,
      projectId: props.projectId,
      repos: chosen.map((repo) => ({
        path: repo.path,
        name: repoName(repo.path, projectName),
      })),
      message,
      push: andPush,
      onRefresh: props.onRefresh,
    })
    props.onClose()
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
    base: string
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
        title: result.title,
        body: result.body,
      },
    })
  }

  function pullRequest(commitFirst: boolean) {
    start('Starting…', async (repo) => {
      const target = targets[repo]
      if (target?.kind !== 'ready') {
        throw new Error('The branches are not loaded')
      }
      await draftPullRequest(
        repo,
        commitFirst && dirty.some((item) => item.path === repo),
        target.base
      )
    })
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

  return (
    <Dialog open onOpenChange={() => props.onClose()}>
      <DialogContent className="top-[12vh] translate-y-0 sm:max-w-lg">
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

        {entries === null && (
          <>
            {repos.length === 1 && (
              <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                {props.action === 'pullRequest' ? (
                  <BaseSelect
                    head={repos[0].branch ?? 'detached'}
                    target={targets[repos[0].path]}
                    onBase={(base) => chooseBase(repos[0].path, base)}
                  />
                ) : (
                  (repos[0].branch ?? 'detached')
                )}
                <span className="shrink-0">
                  · {repos[0].changed}{' '}
                  {repos[0].changed === 1 ? 'change' : 'changes'}
                </span>
              </div>
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
                      disabled={targets[repo.path]?.kind === 'failed'}
                      checked={
                        selected.includes(repo.path) &&
                        targets[repo.path]?.kind !== 'failed'
                      }
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
                    {props.action === 'pullRequest' ? (
                      <BaseSelect
                        head={repo.branch ?? 'detached'}
                        target={targets[repo.path]}
                        onBase={(base) => chooseBase(repo.path, base)}
                      />
                    ) : (
                      <span className="text-muted-foreground truncate text-xs">
                        {repo.branch ?? 'detached'}
                      </span>
                    )}
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
            {props.action === 'pullRequest' && dirty.length > 0 && (
              <p>
                You have local changes
                {repos.length > 1 &&
                  ` in ${dirty.map((repo) => repoName(repo.path, projectName)).join(', ')}`}
                . Do you want to commit and push them before creating the pull
                request?
              </p>
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
              {props.action === 'pullRequest' && dirty.length > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => pullRequest(false)}
                  >
                    Continue without them
                  </Button>
                  <Button
                    size="sm"
                    disabled={loading}
                    onClick={() => pullRequest(true)}
                  >
                    Commit and continue
                  </Button>
                </>
              )}
              {props.action === 'pullRequest' && dirty.length === 0 && (
                <Button
                  size="sm"
                  disabled={loading || chosen.length === 0}
                  onClick={() => pullRequest(false)}
                >
                  Create pull request
                </Button>
              )}
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
                    <span className="mt-0.5 flex size-4 shrink-0 overflow-hidden">
                      <HugeiconsIcon
                        icon={stateIcons[entry.state]}
                        className={cn(
                          'size-4',
                          entry.state === 'working' && 'animate-spin',
                          entry.state === 'review' && 'text-info',
                          entry.state === 'done' && 'text-success',
                          entry.state === 'failed' && 'text-destructive',
                          entry.state === 'skipped' && 'text-muted-foreground'
                        )}
                      />
                    </span>
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
