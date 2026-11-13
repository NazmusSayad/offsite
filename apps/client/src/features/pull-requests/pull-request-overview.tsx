import type {
  PullRequestAction,
  PullRequestDetails,
} from '@offsite/core/pull-requests'
import { useState } from 'react'
import { Markdown } from '@/components/markdown/markdown'
import { Button } from '@/components/ui/button'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

export function PullRequestOverview(props: {
  details: PullRequestDetails
  busy: boolean
  onPerform: (action: PullRequestAction, label: string) => Promise<boolean>
}) {
  const details = props.details
  const [comment, setComment] = useState('')

  return (
    <div className="grid gap-5 p-4">
      <section className="grid gap-2">
        {details.body.trim() === '' && (
          <p className="text-muted-foreground text-xs italic">
            No description provided.
          </p>
        )}
        {details.body.trim() !== '' && (
          <Markdown text={details.body} className="text-sm" />
        )}
      </section>
      {details.checkList.length > 0 && (
        <section className="grid gap-1.5">
          <h3 className="text-muted-foreground text-xs font-medium">Checks</h3>
          <div className="border-border/60 grid rounded-lg border">
            {details.checkList.map((check, index) => (
              <div
                key={`${check.name} ${index}`}
                className="border-border/60 flex min-w-0 items-center gap-2 border-b px-3 py-1.5 text-xs last:border-b-0"
              >
                <span
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    check.status === 'passing' && 'bg-success',
                    check.status === 'failing' && 'bg-destructive',
                    check.status === 'pending' && 'bg-warning',
                    check.status === 'skipped' && 'bg-muted-foreground/50'
                  )}
                />
                {check.url === null && (
                  <span className="text-foreground min-w-0 flex-1 truncate">
                    {check.name}
                  </span>
                )}
                {check.url !== null && (
                  <a
                    href={check.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground min-w-0 flex-1 truncate hover:underline"
                  >
                    {check.name}
                  </a>
                )}
                <span className="text-muted-foreground shrink-0 capitalize">
                  {check.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {details.reviews.length > 0 && (
        <section className="grid gap-1.5">
          <h3 className="text-muted-foreground text-xs font-medium">Reviews</h3>
          <div className="flex flex-wrap gap-1.5">
            {details.reviews.map((review) => (
              <span
                key={review.author}
                className={cn(
                  'bg-muted rounded-full px-2 py-0.5 text-xs',
                  review.state === 'APPROVED' && 'bg-success/12 text-success',
                  review.state === 'CHANGES_REQUESTED' &&
                    'bg-destructive/12 text-destructive'
                )}
              >
                {review.author} ·{' '}
                {review.state.toLowerCase().replaceAll('_', ' ')}
              </span>
            ))}
          </div>
        </section>
      )}
      <section className="grid gap-2">
        <h3 className="text-muted-foreground text-xs font-medium">
          {details.comments.length === 0
            ? 'Comments'
            : `Comments (${details.comments.length})`}
        </h3>
        {details.comments.map((item, index) => (
          <div
            key={`${item.date} ${index}`}
            className="border-border/60 grid gap-1.5 rounded-lg border px-3 py-2"
          >
            <span className="text-muted-foreground text-xs">
              <span className="text-foreground font-medium">{item.author}</span>{' '}
              · {timeAgo(item.date)}
            </span>
            <Markdown text={item.body} className="text-sm" />
          </div>
        ))}
        <form
          className="grid gap-2"
          onSubmit={async (event) => {
            event.preventDefault()
            if (
              await props.onPerform(
                { kind: 'comment', body: comment.trim() },
                'Comment posted'
              )
            ) {
              setComment('')
            }
          }}
        >
          <textarea
            className="border-input bg-background focus-visible:ring-ring/24 min-h-20 w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
            placeholder="Leave a comment"
            aria-label="Comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
          <div className="flex justify-end gap-2">
            {details.state === 'OPEN' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={props.busy || comment.trim() === ''}
                onClick={async () => {
                  if (
                    await props.onPerform(
                      { kind: 'requestChanges', body: comment.trim() },
                      'Changes requested'
                    )
                  ) {
                    setComment('')
                  }
                }}
              >
                Request changes
              </Button>
            )}
            <Button
              type="submit"
              size="sm"
              disabled={props.busy || comment.trim() === ''}
            >
              Comment
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
