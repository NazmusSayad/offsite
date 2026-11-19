import type { SideQuestExchange } from '@offsite/core/side-quests'

const RULES =
  'This is a side question about this conversation, asked apart from the main task. Nothing here is added to the conversation. Everything before this message is reference only: do not continue, run or complete any task, plan or request from it. You may read and search files and run checks that change nothing. Do not modify files, git state, configuration or anything else in the workspace, and do not use sub-agents.'

export function sideQuestPrompt(
  history: SideQuestExchange[],
  question: string
) {
  const earlier = history.map(
    (exchange) =>
      `Question: ${exchange.question}\n\nAnswer: ${exchange.response}`
  )
  return [
    RULES,
    ...(earlier.length === 0
      ? []
      : [`Earlier side questions and answers:\n\n${earlier.join('\n\n')}`]),
    `Side question: ${question}`,
  ].join('\n\n')
}
