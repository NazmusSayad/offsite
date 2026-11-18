import type { AnswerDraft, Question } from './items.ts'

export function chosenAnswers(questions: Question[], answers: AnswerDraft) {
  return Object.fromEntries(
    questions.flatMap((item) => {
      const values = [
        ...(answers.picked[item.question] ?? []),
        answers.other[item.question]?.trim() ?? '',
      ].filter((value) => value !== '')
      return values.length === 0 ? [] : [[item.question, values.join(', ')]]
    })
  )
}
