import { ShieldAlertIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { PermissionRequest } from '@offsite/core/items'
import { Markdown } from '@/components/markdown/markdown'
import { Button } from '@/components/ui/button'
import { summary, ToolDetails } from '@/features/transcript/tool-details'
import { respond } from '@/lib/requests'
import { cn } from '@/lib/utils'
import { Countdown, QuestionPrompt } from './question-prompt'

const attached =
  'composer-glass relative mx-auto -mb-[calc(1rem+1px)] w-[calc(100%-2.75rem)] rounded-t-2xl border border-b-0 px-1 pt-1 pb-[calc(1rem+1px+0.25rem)] text-xs/4'

export function PermissionPrompt(props: {
  request: PermissionRequest
  machine: string
  cwd: string
  count: number
  draft: string
}) {
  const request = props.request
  if (request.kind === 'question') {
    return (
      <QuestionPrompt
        machine={props.machine}
        request={request}
        draft={props.draft}
      />
    )
  }
  const plan = request.kind === 'plan'
  const detail = plan ? '' : summary(request.item, props.cwd)
  return (
    <div
      className={cn(
        attached,
        'border-warning/28 bg-linear-to-b from-warning/8 to-warning/8'
      )}
    >
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-3 px-1 py-1">
        <span className="text-warning flex justify-center pt-0.5">
          <HugeiconsIcon icon={ShieldAlertIcon} className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col items-start gap-1">
          <span className="text-muted-foreground text-2xs flex w-full min-w-0 items-center gap-2">
            <span className="text-warning min-w-0 font-medium wrap-anywhere">
              {plan ? 'Ready to code?' : request.title}
            </span>
            {props.count > 1 && (
              <span className="ml-auto shrink-0 tabular-nums">
                1/{props.count}
              </span>
            )}
          </span>
          {detail !== '' && (
            <span className="text-foreground block max-h-20 w-full min-w-0 overflow-auto font-mono text-xs whitespace-pre">
              {detail}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {request.autoResolve !== undefined && (
            <Countdown
              label={
                request.autoResolve.decision === 'allow' ? 'Approve' : 'Decline'
              }
              at={request.autoResolve.at}
            />
          )}
          <Button
            size="xs"
            variant="outline"
            onClick={() => respond(request.id, 'deny', null)}
          >
            {plan ? 'Keep planning' : 'Decline'}
          </Button>
          {request.kind === 'approval' && request.canAlwaysAllow && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => respond(request.id, 'always', null)}
            >
              Always
            </Button>
          )}
          <Button size="xs" onClick={() => respond(request.id, 'allow', null)}>
            {plan ? 'Approve plan' : 'Approve'}
          </Button>
        </span>
        {plan && (
          <div className="col-span-3 max-h-60 overflow-auto px-1 empty:hidden">
            <Markdown text={request.plan} />
          </div>
        )}
        {request.kind === 'approval' && request.item.kind !== 'command' && (
          <div className="col-span-3 max-h-60 overflow-auto px-1 empty:hidden">
            <ToolDetails item={request.item} />
          </div>
        )}
      </div>
    </div>
  )
}
