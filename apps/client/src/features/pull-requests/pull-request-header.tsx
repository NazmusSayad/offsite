import type {
  PullRequestDetails,
  PullRequestSummary,
} from '@offsite/core/pull-requests'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PullRequestHeader(props: {
  pull: PullRequestSummary
  details: PullRequestDetails | null
}) {
  const pull = props.pull
  const details = props.details

  return (
    <>
      <h2 className="text-foreground text-base leading-snug font-semibold wrap-anywhere">
        {pull.title}
      </h2>
      <div className="text-muted-foreground grid gap-1 text-xs leading-relaxed wrap-anywhere">
        <p className="text-pretty">
          <a
            href={`https://github.com/${pull.author}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground font-medium hover:underline"
          >
            {pull.author}
          </a>{' '}
          {pull.state === 'OPEN' && 'wants to merge'}
          {pull.state === 'MERGED' && 'merged'}
          {pull.state === 'CLOSED' && 'wanted to merge'}{' '}
          {details === null && (
            <span className="bg-accent inline-block h-3 w-16 animate-pulse rounded-md align-middle" />
          )}
          {details !== null && (
            <span className="text-foreground whitespace-nowrap">
              {details.commits.length}{' '}
              {details.commits.length === 1 ? 'commit' : 'commits'}
            </span>
          )}{' '}
          into{' '}
          <code className="bg-muted text-foreground rounded box-decoration-clone px-1 py-px">
            {pull.base}
          </code>{' '}
          from{' '}
          <code className="bg-muted text-foreground rounded box-decoration-clone px-1 py-px">
            {pull.head}
          </code>
          {details !== null && details.head === details.current && (
            <>
              {' '}
              <span className="text-info whitespace-nowrap">
                (current branch)
              </span>
            </>
          )}
        </p>
        <p className="text-balance">
          <span className="ring-border inline-flex overflow-hidden rounded-md font-mono text-[11px] leading-[15px] whitespace-nowrap tabular-nums ring-1 ring-inset">
            <span
              className={cn(
                'px-1.5 pt-px',
                pull.additions > 0 && 'bg-diff-addition/12 text-diff-addition',
                pull.additions === 0 && 'text-muted-foreground'
              )}
            >
              +{pull.additions.toLocaleString()}
            </span>
            <span
              className={cn(
                'px-1.5 pt-px',
                pull.deletions > 0 && 'bg-diff-deletion/12 text-diff-deletion',
                pull.deletions === 0 && 'text-muted-foreground'
              )}
            >
              −{pull.deletions.toLocaleString()}
            </span>
          </span>{' '}
          across{' '}
          {details === null && (
            <span className="bg-accent inline-block h-3 w-10 animate-pulse rounded-md align-middle" />
          )}
          {details !== null && (
            <span className="text-foreground whitespace-nowrap">
              {details.changedFiles}{' '}
              {details.changedFiles === 1 ? 'file' : 'files'}
            </span>
          )}
          ,{' '}
          <span className="whitespace-nowrap">
            updated{' '}
            {timeAgo(pull.updatedAt) === 'now'
              ? 'just now'
              : `${timeAgo(pull.updatedAt)} ago`}
          </span>
        </p>
      </div>
    </>
  )
}
