import {
  ArrowDown02Icon,
  ArrowUp02Icon,
  CheckmarkCircle02Icon,
  CloudOffIcon,
  CloudUploadIcon,
  FileEditIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'

export function RepoStatus(props: { repo: GitRepo }) {
  const repo = props.repo
  return (
    <div className="text-muted-foreground ml-auto flex shrink-0 items-center gap-2.5 pr-1.5 pl-2 tabular-nums">
      {repo.changed > 0 && (
        <span
          className="flex items-center gap-1.5"
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
        </span>
      )}
      <SyncStatus repo={repo} />
    </div>
  )
}

function SyncStatus(props: { repo: GitRepo }) {
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
        className="flex items-center gap-1.5"
        title="This repository has no remote, so there is nothing to pull or push"
      >
        <HugeiconsIcon icon={CloudOffIcon} className="size-3.5" />
        No remote
      </span>
    )
  }
  if (repo.upstream === null) {
    return (
      <span
        className="bg-warning/10 text-warning flex h-5 items-center gap-1 rounded-full px-2"
        title={`${repo.branch} is not on the remote yet, push it to publish`}
      >
        <HugeiconsIcon icon={CloudUploadIcon} className="size-3.5" />
        Not published
      </span>
    )
  }
  if (repo.ahead === 0 && repo.behind === 0) {
    return (
      <span
        className="flex items-center gap-1.5"
        title={`Up to date with ${repo.upstream}`}
      >
        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
        Up to date
      </span>
    )
  }
  return (
    <span
      className="bg-warning/10 text-warning flex h-5 items-center gap-2 rounded-full px-2"
      title={syncTitle(repo.behind, repo.ahead, repo.upstream)}
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
    </span>
  )
}

function syncTitle(behind: number, ahead: number, upstream: string) {
  const parts = [
    behind > 0 && `${behind} ${behind === 1 ? 'commit' : 'commits'} to pull`,
    ahead > 0 && `${ahead} ${ahead === 1 ? 'commit' : 'commits'} to push`,
  ].filter(Boolean)
  return `${parts.join(' and ')} with ${upstream}`
}
