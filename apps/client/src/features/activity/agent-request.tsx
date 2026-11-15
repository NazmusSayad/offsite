import type { PermissionDecision, PermissionRequest } from '@offsite/core/items'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { summary } from '@/features/transcript/tool-details'
import { showError } from '@/lib/store'

export function AgentRequest(props: {
  machine: string
  sessionId: string
  request: PermissionRequest
  cwd: string
  onOpen: () => void
}) {
  const request = props.request

  function respond(
    decision: PermissionDecision,
    answers: Record<string, string> | null
  ) {
    call(props.machine, 'sessions.respond', {
      sessionId: props.sessionId,
      requestId: request.id,
      decision,
      answers,
    }).catch(showError)
  }

  if (request.kind === 'question') {
    const question = request.questions[0]
    const quick = request.questions.length === 1 && !question.multiSelect
    return (
      <div className="border-question/30 -mx-3 -mb-3 flex flex-col gap-2 border-t px-3 pt-2.5 pb-3 pl-9">
        <p className="text-foreground/90 text-[13px] leading-5 wrap-anywhere">
          {question.question}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {quick &&
            question.options.map((option) => (
              <Button
                key={option.label}
                size="sm"
                variant="outline"
                title={option.description}
                onClick={() =>
                  respond('allow', { [question.question]: option.label })
                }
              >
                {option.label}
              </Button>
            ))}
          <Button size="sm" variant="ghost" onClick={props.onOpen}>
            {quick ? 'Other…' : 'Answer'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-question/30 -mx-3 -mb-3 flex flex-col gap-2 border-t px-3 pt-2.5 pb-3 pl-9">
      <p className="text-foreground/90 line-clamp-3 font-mono text-xs leading-5 wrap-anywhere">
        {request.kind === 'plan' ? 'Plan' : summary(request.item, props.cwd)}
      </p>
      <div className="flex gap-1.5">
        {request.kind === 'plan' && (
          <Button size="sm" variant="ghost" onClick={props.onOpen}>
            Read
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => respond('deny', null)}
        >
          Decline
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => respond('allow', null)}
        >
          Approve
        </Button>
      </div>
    </div>
  )
}
