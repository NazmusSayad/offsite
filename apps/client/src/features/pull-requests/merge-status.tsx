import {
  AlertCircleIcon,
  CancelCircleIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  EyeIcon,
  GitMergeIcon,
  Loading03Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type {
  PullRequestAction,
  PullRequestDetails,
} from '@offsite/core/pull-requests'
import { cn } from '@/lib/utils'

export type Notice = { kind: PullRequestAction['kind']; text: string }

type Status = {
  text: string
  tone: 'good' | 'bad' | 'wait' | 'merged' | 'none'
  icon: IconSvgElement
}

const pendingLabels: Record<PullRequestAction['kind'], string> = {
  merge: 'Merging',
  close: 'Closing',
  reopen: 'Reopening',
  ready: 'Marking ready',
  draft: 'Converting to draft',
  checkout: 'Checking out',
  approve: 'Approving',
  requestChanges: 'Requesting changes',
  comment: 'Posting comment',
}

export function MergeStatus(props: {
  details: PullRequestDetails
  busy: PullRequestAction['kind'] | null
  notice: Notice | null
}) {
  const status =
    props.busy !== null
      ? {
          text: pendingLabels[props.busy],
          tone: 'none' as const,
          icon: Loading03Icon,
        }
      : props.notice !== null
        ? noticeStatus(props.notice)
        : mergeStatus(props.details)
  if (status === null) {
    return null
  }
  return (
    <p
      role="status"
      title={status.text}
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium',
        status.tone === 'good' && 'text-success',
        status.tone === 'bad' && 'text-destructive',
        status.tone === 'wait' && 'text-warning',
        status.tone === 'merged' && 'text-violet-500',
        status.tone === 'none' && 'text-muted-foreground'
      )}
    >
      <HugeiconsIcon
        icon={status.icon}
        className={cn(
          'size-3.5 shrink-0',
          props.busy !== null && 'animate-spin'
        )}
      />
      <span className="truncate">{status.text}</span>
    </p>
  )
}

function noticeStatus(notice: Notice): Status {
  if (notice.kind === 'merge') {
    return { text: notice.text, tone: 'merged', icon: GitMergeIcon }
  }
  if (notice.kind === 'close') {
    return { text: notice.text, tone: 'bad', icon: CancelCircleIcon }
  }
  return { text: notice.text, tone: 'good', icon: CheckmarkCircle02Icon }
}

function mergeStatus(details: PullRequestDetails): Status | null {
  if (details.state !== 'OPEN' || details.draft) {
    return null
  }
  if (details.mergeable === 'CONFLICTING') {
    return {
      text: 'Conflicts with the base branch',
      tone: 'bad',
      icon: AlertCircleIcon,
    }
  }
  if (details.checks === 'failing') {
    return { text: 'Some checks failed', tone: 'bad', icon: CancelCircleIcon }
  }
  if (details.review === 'CHANGES_REQUESTED') {
    return { text: 'Changes requested', tone: 'bad', icon: AlertCircleIcon }
  }
  if (details.checks === 'pending') {
    return { text: 'Checks are running', tone: 'wait', icon: Clock01Icon }
  }
  if (details.review === 'REVIEW_REQUIRED') {
    return { text: 'Review required', tone: 'wait', icon: EyeIcon }
  }
  return { text: 'Ready to merge', tone: 'good', icon: CheckmarkCircle02Icon }
}
