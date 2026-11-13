import {
  ArrowDown01Icon,
  ArrowDown02Icon,
  ArrowUp02Icon,
  CheckmarkCircle02Icon,
  CloudOffIcon,
  CloudUploadIcon,
  FileEditIcon,
  Delete02Icon,
  GitCommitIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import { useState } from 'react'
import { call } from '@/api/connection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { startCommit, startGitToast } from '@/features/git/git-toast'
import { touch } from '@/lib/utils'
import { keepFocusOnTouch, refocusComposer } from './picker'

type Target = { machine: string; projectId: string; onRefresh: () => void }

export function RepoStatus(props: { repo: GitRepo; target: Target }) {
  const repo = props.repo
  const [discarding, setDiscarding] = useState(false)
  return (
    <div className="text-muted-foreground ml-auto flex shrink-0 items-center gap-1.5 pl-2 whitespace-nowrap tabular-nums @max-sm:flex-1 @max-sm:justify-end @max-sm:pl-0">
      {repo.changed > 0 && (
        <DropdownMenu modal={!touch.matches}>
          <DropdownMenuTrigger asChild>
            <button
              className="hover:bg-accent hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-1.5 outline-none @max-sm:mr-auto"
              title={`${repo.changed} uncommitted ${repo.changed === 1 ? 'file' : 'files'}, ${repo.added} lines added and ${repo.removed} removed`}
            >
              <HugeiconsIcon icon={FileEditIcon} className="size-3.5" />
              <span>
                {repo.changed}
                <span className="hidden @lg:inline">
                  {repo.changed === 1 ? ' file' : ' files'}
                </span>
              </span>
              <span className="text-diff-addition">+{repo.added}</span>
              <span className="text-diff-deletion">−{repo.removed}</span>
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onOpenAutoFocus={keepFocusOnTouch}
            onCloseAutoFocus={refocusComposer}
          >
            <ChangesMenu
              repo={repo}
              target={props.target}
              onDiscard={() => setDiscarding(true)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <DiscardDialog repo={repo} target={props.target} />
        </AlertDialogContent>
      </AlertDialog>
      <SyncStatus repo={repo} target={props.target} />
    </div>
  )
}

function ChangesMenu(props: {
  repo: GitRepo
  target: Target
  onDiscard: () => void
}) {
  return (
    <>
      <DropdownMenuItem
        onSelect={() => startCommit(props.target, props.repo.path, '', false)}
      >
        <HugeiconsIcon icon={GitCommitIcon} />
        Commit
      </DropdownMenuItem>
      {props.repo.branch !== null && props.repo.remote && (
        <DropdownMenuItem
          onSelect={() => startCommit(props.target, props.repo.path, '', true)}
        >
          <HugeiconsIcon icon={ArrowUp02Icon} />
          Commit and push
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onSelect={props.onDiscard}>
        <HugeiconsIcon icon={Delete02Icon} />
        Discard changes…
      </DropdownMenuItem>
    </>
  )
}

function DiscardDialog(props: { repo: GitRepo; target: Target }) {
  const count = props.repo.changed
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          Discard changes in {count} {count === 1 ? 'file' : 'files'}?
        </AlertDialogTitle>
        <AlertDialogDescription>
          All uncommitted changes, including new files, will be permanently
          deleted. This can&apos;t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onClick={() =>
            void startGitToast({
              labels: {
                working: 'Discarding changes…',
                done: 'Changes discarded',
                failed: 'Discard failed',
              },
              task: () => discardAll(props.target, props.repo.path),
              onRefresh: props.target.onRefresh,
            })
          }
        >
          Discard changes
        </AlertDialogAction>
      </AlertDialogFooter>
    </>
  )
}

async function discardAll(target: Target, path: string) {
  const before = await changesOf(target, path)
  if (before.staged.length > 0) {
    await call(target.machine, 'git.run', {
      projectId: target.projectId,
      repo: path,
      action: {
        kind: 'unstage',
        paths: before.staged.map((resource) => resource.path),
      },
    })
  }
  const after = await changesOf(target, path)
  await call(target.machine, 'git.run', {
    projectId: target.projectId,
    repo: path,
    action: {
      kind: 'discard',
      tracked: after.changes
        .filter((resource) => resource.status !== 'U')
        .map((resource) => resource.path),
      untracked: after.changes
        .filter((resource) => resource.status === 'U')
        .map((resource) => resource.path),
    },
  })
  return null
}

async function changesOf(target: Target, path: string) {
  const repo = (
    await call(target.machine, 'git.changes', { projectId: target.projectId })
  ).find((item) => item.path === path)
  if (repo === undefined) {
    throw new Error(
      `${path === '' ? 'The project' : path} is not a git repository`
    )
  }
  return repo
}

function SyncStatus(props: { repo: GitRepo; target: Target }) {
  const repo = props.repo
  if (repo.branch === null) {
    return (
      <span
        className="bg-warning/10 text-warning flex h-5 items-center gap-1 rounded-full px-2"
        title="HEAD is detached, so new commits won't be on any branch"
      >
        Not on a branch
      </span>
    )
  }
  if (!repo.remote) {
    return (
      <span
        className="flex items-center gap-1.5 pr-1.5"
        title="This repository has no remote, so there is nothing to pull or push"
      >
        <HugeiconsIcon icon={CloudOffIcon} className="size-3.5" />
        No remote
      </span>
    )
  }
  if (repo.upstream === null) {
    return (
      <button
        className="bg-warning/10 text-warning hover:bg-warning/20 flex h-5 cursor-pointer items-center gap-1 rounded-full px-2 outline-none"
        title={`${repo.branch} is not on the remote yet. Click to publish it`}
        onClick={() =>
          runSync(props.target, repo.path, 'git.push', {
            working: 'Publishing…',
            done: 'Published',
            failed: 'Publish failed',
          })
        }
      >
        <HugeiconsIcon icon={CloudUploadIcon} className="size-3.5" />
        Not published
      </button>
    )
  }
  if (repo.ahead === 0 && repo.behind === 0) {
    return (
      <span
        className="flex items-center gap-1.5 pr-1.5"
        title={`Up to date with ${repo.upstream}`}
      >
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
        Up to date
      </span>
    )
  }
  return (
    <button
      className="bg-warning/10 text-warning hover:bg-warning/20 flex h-5 cursor-pointer items-center gap-2 rounded-full px-2 outline-none"
      title={`${syncTitle(repo.behind, repo.ahead, repo.upstream)}. Click to ${repo.behind > 0 && repo.ahead > 0 ? 'pull and push' : repo.behind > 0 ? 'pull' : 'push'}`}
      onClick={() => {
        if (repo.behind > 0 && repo.ahead > 0) {
          runSync(props.target, repo.path, 'git.sync', {
            working: 'Pulling and pushing…',
            done: 'Pulled and pushed',
            failed: 'Pull and push failed',
          })
          return
        }
        if (repo.behind > 0) {
          runSync(props.target, repo.path, 'git.sync', {
            working: 'Pulling…',
            done: 'Pulled',
            failed: 'Pull failed',
          })
          return
        }
        runSync(props.target, repo.path, 'git.push', {
          working: 'Pushing…',
          done: 'Pushed',
          failed: 'Push failed',
        })
      }}
    >
      {repo.behind > 0 && (
        <span className="flex items-center gap-0.5">
          <HugeiconsIcon icon={ArrowDown02Icon} className="size-3.5" />
          {repo.behind}
          <span className="hidden @xl:inline">&nbsp;to pull</span>
        </span>
      )}
      {repo.ahead > 0 && (
        <span className="flex items-center gap-0.5">
          <HugeiconsIcon icon={ArrowUp02Icon} className="size-3.5" />
          {repo.ahead}
          <span className="hidden @xl:inline">&nbsp;to push</span>
        </span>
      )}
    </button>
  )
}

function runSync(
  target: Target,
  repo: string,
  method: 'git.push' | 'git.sync',
  labels: { working: string; done: string; failed: string }
) {
  void startGitToast({
    labels,
    task: async () => {
      await call(target.machine, method, {
        projectId: target.projectId,
        repo,
      })
      return null
    },
    onRefresh: target.onRefresh,
  })
}

function syncTitle(behind: number, ahead: number, upstream: string) {
  const parts = [
    behind > 0 && `${behind} ${behind === 1 ? 'commit' : 'commits'} to pull`,
    ahead > 0 && `${ahead} ${ahead === 1 ? 'commit' : 'commits'} to push`,
  ].filter(Boolean)
  return `${parts.join(' and ')} with ${upstream}`
}
