import type { QuestionItem } from '@/transcript/timeline'

export function QuestionCard(props: { item: QuestionItem }) {
  const answers = props.item.answers
  return (
    <div className="flex min-w-0 flex-col gap-3 text-sm leading-6 select-text">
      {props.item.questions.map((question) => (
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
          {answers?.[question.question] !== undefined && (
            <p className="text-foreground whitespace-pre-wrap">
              Answer: {answers[question.question]}
            </p>
          )}
        </div>
      ))}
      {props.item.status === 'failed' && (
        <p className="text-muted-foreground">Skipped</p>
      )}
    </div>
  )
}
