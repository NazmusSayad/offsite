import type { Prompt } from '@offsite/core/items'
import type { Provider } from '@offsite/core/providers'
import type { SideQuest } from '@offsite/core/side-quests'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { focusComposer, hasComposer } from '@/features/composer/composer-input'
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

export function sideDraftKey(machine: string, sessionId: string) {
  return `side:${machineKey(machine, sessionId)}`
}

export const NEW_QUEST = 'new'

const usePicks = create<Record<string, string>>()(
  persist(() => ({}), { name: 'sideQuestPicks' })
)

export function useSideQuestPick(machine: string, sessionId: string | null) {
  return usePicks((picks) =>
    sessionId === null ? null : (picks[machineKey(machine, sessionId)] ?? null)
  )
}

export function questStarts(quests: SideQuest[]) {
  return quests.filter(
    (quest) => quests.find((other) => other.questId === quest.questId) === quest
  )
}

export function questLabel(quest: SideQuest) {
  return quest.question === '' ? 'Image' : quest.question
}

export function pickSideQuest(
  machine: string,
  sessionId: string,
  questId: string
) {
  usePicks.setState({ [machineKey(machine, sessionId)]: questId })
}

let focusPending = false

export function takeInputFocus() {
  const pending = focusPending
  focusPending = false
  return pending
}

const command = /^\s*\/(?:btw|side)(?:\s+([\s\S]*))?$/i

export function isSideQuest(text: string) {
  return command.test(text)
}

async function askSideQuest(
  selection: Selection,
  sessionId: string,
  questId: string | null,
  prompt: Prompt
) {
  const result = await call(selection.machine, 'sideQuests.ask', {
    sessionId,
    questId,
    projectId: selection.projectId,
    worktreeId: selection.worktreeId,
    settings: getState().settings,
    prompt,
  })
  pickSideQuest(selection.machine, sessionId, result.questId)
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
  pickSideQuest(selection.machine, selection.sessionId, NEW_QUEST)
  openPanel({ panel: 'quests' })
  const side = sideDraftKey(selection.machine, selection.sessionId)
  if (hasComposer(side)) {
    focusComposer(side)
  } else {
    focusPending = true
  }
  if (question.text !== '' || question.images.length > 0) {
    await askSideQuest(selection, selection.sessionId, null, question)
  }
  editDraft(key, (current) => ({ ...current, text: '', images: [], files: [] }))
}

export async function sendSideDraft(
  selection: Selection,
  sessionId: string,
  questId: string | null
) {
  const key = sideDraftKey(selection.machine, sessionId)
  await askSideQuest(
    selection,
    sessionId,
    questId,
    await draftPrompt(selection.machine, key)
  )
  editDraft(key, (current) => ({ ...current, text: '', images: [], files: [] }))
}
