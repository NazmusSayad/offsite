import type { ToolResult, ToolUse } from '@/transcript/tool-details'

export function QuestionCard(props: {
  tool: ToolUse
  result: ToolResult | undefined
}) {
  const questions = props.tool.input.questions as {
    question: string
    options: { label: string; description: string }[]
  }[]
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm leading-6 select-text">
      {questions.map((question) => (
        <div key={question.question}>
          <p className="text-foreground font-medium">{question.question}</p>
          <ul className="text-secondary-label list-disc pl-5">
            {question.options.map((option) => (
              <li key={option.label}>
                {option.label}
                {option.description !== '' && ` — ${option.description}`}
              </li>
            ))}
          </ul>
          {props.result?.answers?.[question.question] !== undefined && (
            <p className="text-foreground whitespace-pre-wrap">
              Answer: {props.result.answers[question.question]}
            </p>
          )}
        </div>
      ))}
      {props.result?.isError === true && (
        <p className="text-muted-foreground">Skipped</p>
      )}
    </div>
  )
}
