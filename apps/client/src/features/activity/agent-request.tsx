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
      <div className="flex flex-col gap-1.5 px-2.5 pb-2 pl-8">
        <p className="text-muted-foreground truncate text-xs">
          {question.question}
        </p>
        <div className="flex flex-wrap gap-1">
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
          <Button size="xs" variant="ghost" onClick={props.onOpen}>
            {quick ? 'Other…' : 'Answer'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 px-2.5 pb-2 pl-8">
      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-xs">
        {request.kind === 'plan' ? 'Plan' : summary(request.item, props.cwd)}
      </span>
      {request.kind === 'plan' && (
        <Button size="xs" variant="ghost" onClick={props.onOpen}>
          Read
        </Button>
      )}
      <Button size="xs" variant="outline" onClick={() => respond('deny', null)}>
        Decline
      </Button>
      <Button size="xs" onClick={() => respond('allow', null)}>
        Approve
      </Button>
    </div>
  )
}
