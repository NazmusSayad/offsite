import {
  CloudUploadIcon,
  GitBranchIcon,
  RefreshIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SourceControlRepo } from '@offsite/core/git'
import { shortHash } from '@/features/source-control/changes'
import { cn } from '@/lib/utils'

export function GitStatus(props: {
  repo: SourceControlRepo
  busy: boolean
  onCheckout: () => void
  onSync: () => void
  onPublish: () => void
}) {
  const repo = props.repo
  return (
    <div className="mr-auto -ml-1.5 flex h-full items-center">
      <button
        type="button"
        title={`${repo.branch ?? 'HEAD'} (Git) - Checkout Branch/Tag...`}
        className="hover:bg-accent hover:text-foreground flex h-full cursor-pointer items-center gap-1 px-1.5 tabular-nums"
        onClick={props.onCheckout}
      >
        <HugeiconsIcon icon={GitBranchIcon} className="size-3.5" />
        {repo.branch ?? (repo.head === null ? 'HEAD' : shortHash(repo.head))}
        {repo.changes.length > 0 && '*'}
        {repo.staged.length > 0 && '+'}
        {repo.merge.length > 0 && '!'}
      </button>
      {repo.upstream !== null && (
        <button
          type="button"
          title="Synchronize Changes"
          disabled={props.busy}
          className="hover:bg-accent hover:text-foreground flex h-full cursor-pointer items-center gap-1 px-1.5 tabular-nums"
          onClick={props.onSync}
        >
          <HugeiconsIcon
            icon={RefreshIcon}
            className={cn('size-3.5', props.busy && 'animate-spin')}
          />
          {(repo.behind > 0 || repo.ahead > 0) &&
            `${repo.behind}↓ ${repo.ahead}↑`}
        </button>
      )}
      {repo.upstream === null && repo.branch !== null && repo.remote && (
        <button
          type="button"
          title="Publish Branch"
          aria-label="Publish Branch"
          disabled={props.busy}
          className="hover:bg-accent hover:text-foreground flex h-full cursor-pointer items-center gap-1 px-1.5 tabular-nums"
          onClick={props.onPublish}
        >
          <HugeiconsIcon icon={CloudUploadIcon} className="size-3.5" />
        </button>
      )}
    </div>
  )
}
