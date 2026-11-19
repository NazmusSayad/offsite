import type { Prompt } from '@offsite/core/items'
import type { Provider } from '@offsite/core/providers'
import { call } from '@/api/connection'
import { editDraft } from '@/features/composer/drafts'
import { draftPrompt } from '@/features/composer/send'
import { getState, type Selection } from '@/lib/store'
import { openPanel } from '@/lib/url'

const commands = ['btw', 'side'].map((name) => ({
  name,
  description: 'Ask a side question without adding it to the thread',
  hint: '<question>',
  inline: false,
}))

export function sideQuestCommands(provider: Provider) {
  return provider === 'opencode' ? [] : commands
}

const command = /^\s*\/(?:btw|side)(?:\s+([\s\S]*))?$/i

export function isSideQuest(text: string) {
  return command.test(text)
}

export async function askSideQuest(
  selection: Selection,
  sessionId: string,
  prompt: Prompt
) {
  await call(selection.machine, 'sideQuests.ask', {
    sessionId,
    projectId: selection.projectId,
    worktreeId: selection.worktreeId,
    settings: getState().settings,
    prompt,
  })
}

export async function sendSideQuestDraft(key: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    throw new Error('Side quests need a thread with at least one message')
  }
  if (getState().settings.provider === 'opencode') {
    throw new Error('Side quests work only in Claude and Codex threads')
  }
  const prompt = await draftPrompt(selection.machine, key)
  const match = command.exec(prompt.text)
  if (match === null) {
    throw new Error('This message is not a side question')
  }
  const question = { text: (match[1] ?? '').trim(), images: prompt.images }
  openPanel({ panel: 'quests' })
  if (question.text !== '' || question.images.length > 0) {
    await askSideQuest(selection, selection.sessionId, question)
  }
  editDraft(key, (current) => ({ ...current, text: '', images: [], files: [] }))
}
