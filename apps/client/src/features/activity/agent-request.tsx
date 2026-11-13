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
      <div className="border-question/20 bg-question/5 flex flex-col gap-2 border-t px-3 py-2.5">
        <p className="text-foreground text-[13px] leading-snug">
          {question.question}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {quick &&
            question.options.map((option) => (
              <Button
                key={option.label}
                size="xs"
                variant="outline"
                title={option.description}
                onClick={() =>
                  respond('allow', { [question.question]: option.label })
                }
              >
                {option.label}
              </Button>
            ))}
          <Button
            size="xs"
            variant={quick ? 'ghost' : 'outline'}
            onClick={props.onOpen}
          >
            {quick ? 'Other…' : `Answer ${request.questions.length} questions`}
          </Button>
        </div>
      </div>
    )
  }

  const detail = request.kind === 'plan' ? '' : summary(request.item, props.cwd)
  return (
    <div className="border-question/20 bg-question/5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-3 py-2">
      <div className="flex min-w-48 flex-1 flex-col">
        <span className="text-question text-xs font-medium">
          {request.kind === 'plan' ? 'Plan ready' : request.title}
        </span>
        {detail !== '' && (
          <span className="text-muted-foreground truncate font-mono text-xs">
            {detail}
          </span>
        )}
      </div>
      <span className="ml-auto flex shrink-0 gap-1.5">
        {request.kind === 'plan' && (
          <Button size="xs" variant="ghost" onClick={props.onOpen}>
            Read
          </Button>
        )}
        <Button
          size="xs"
          variant="outline"
          onClick={() => respond('deny', null)}
        >
          {request.kind === 'plan' ? 'Keep planning' : 'Decline'}
        </Button>
        {request.kind === 'approval' && request.canAlwaysAllow && (
          <Button
            size="xs"
            variant="outline"
            onClick={() => respond('always', null)}
          >
            Always
          </Button>
        )}
        <Button size="xs" onClick={() => respond('allow', null)}>
          Approve
        </Button>
      </span>
    </div>
  )
}
