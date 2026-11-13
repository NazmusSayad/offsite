import {
  GitMergeIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  GitPullRequestIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  PullRequestChecks,
  PullRequestState,
  PullRequestSummary,
} from '@offsite/core/pull-requests'
import { cn } from '@/lib/utils'

export function StateIcon(props: {
  state: PullRequestState
  draft: boolean
  className?: string
}) {
  const look = stateLook(props.state, props.draft)
  return (
    <HugeiconsIcon
      icon={look.icon}
      className={cn('size-4 shrink-0', look.color, props.className)}
    />
  )
}

export function StateBadge(props: { state: PullRequestState; draft: boolean }) {
  const look = stateLook(props.state, props.draft)
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        look.color,
        look.background
      )}
    >
      <HugeiconsIcon icon={look.icon} className="size-3.5" />
      {look.label}
    </span>
  )
}

export function ChecksBadge(props: { checks: PullRequestChecks }) {
  if (props.checks === null) {
    return null
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1',
        props.checks === 'passing' && 'text-success',
        props.checks === 'failing' && 'text-destructive',
        props.checks === 'pending' && 'text-warning'
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {props.checks === 'passing' && 'Checks passed'}
      {props.checks === 'failing' && 'Checks failed'}
      {props.checks === 'pending' && 'Checks running'}
    </span>
  )
}

export function ReviewBadge(props: { review: PullRequestSummary['review'] }) {
  if (props.review === null) {
    return null
  }
  return (
    <span
      className={cn(
        props.review === 'APPROVED' && 'text-success',
        props.review === 'CHANGES_REQUESTED' && 'text-destructive',
        props.review === 'REVIEW_REQUIRED' && 'text-muted-foreground'
      )}
    >
      {props.review === 'APPROVED' && 'Approved'}
      {props.review === 'CHANGES_REQUESTED' && 'Changes requested'}
      {props.review === 'REVIEW_REQUIRED' && 'Review required'}
    </span>
  )
}

function stateLook(state: PullRequestState, draft: boolean) {
  if (state === 'MERGED') {
    return {
      icon: GitMergeIcon,
      label: 'Merged',
      color: 'text-violet-500',
      background: 'bg-violet-500/12',
    }
  }
  if (state === 'CLOSED') {
    return {
      icon: GitPullRequestClosedIcon,
      label: 'Closed',
      color: 'text-destructive',
      background: 'bg-destructive/12',
    }
  }
  if (state === 'OPEN' && draft) {
    return {
      icon: GitPullRequestDraftIcon,
      label: 'Draft',
      color: 'text-muted-foreground',
      background: 'bg-muted',
    }
  }
  if (state === 'OPEN') {
    return {
      icon: GitPullRequestIcon,
      label: 'Open',
      color: 'text-success',
      background: 'bg-success/12',
    }
  }
  throw new Error(`unknown pull request state ${state}`)
}
