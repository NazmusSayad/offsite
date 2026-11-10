import type { PromptDelivery } from '@offsite/core/config'
import type { Prompt, UnsentPrompt } from '@offsite/core/items'
import type { UserItem } from '@/features/transcript/timeline'
import {
  activityOf,
  getState,
  type PendingPrompt,
  type Selection,
  setMachine,
  type State,
  update,
} from './store'

const PREFIX = 'unsent:'
const none: UnsentPrompt[] = []

export function receiveUnsent(machine: string, unsent: UnsentPrompt[]) {
  setMachine(machine, { unsent })
  const pending = getState().pending
  const left = pending.filter(
    (item) => !unsent.some((saved) => saved.id === item.id)
  )
  if (left.length !== pending.length) {
    update({ pending: left })
  }
}

export function addPending(
  selection: Selection,
  prompt: Prompt,
  delivery: PromptDelivery
) {
  const state = getState()
  const id = crypto.randomUUID()
  update({
    pending: [
      ...state.pending,
      {
        id,
        machine: selection.machine,
        projectId: selection.projectId,
        sessionId: selection.sessionId,
        prompt,
        status:
          delivery === 'queue' &&
          activityOf(state.machines, selection.machine, selection.sessionId)
            ?.running === true
            ? 'queued'
            : 'sending',
      },
    ],
  })
  return id
}

export function takePending(id: string) {
  const pending = getState().pending
  update({ pending: pending.filter((item) => item.id !== id) })
  return pending.find((item) => item.id === id)
}

export function selectedUnsent(state: State) {
  return (
    state.machines.find((machine) => machine.id === state.selection?.machine)
      ?.unsent ?? none
  )
}

export function selectedPrompts(state: State): UnsentPrompt[] {
  const selection = state.selection
  if (selection === null) {
    return []
  }
  return [
    ...(state.loaded ? selectedUnsent(state) : []),
    ...state.pending.filter((item) => item.machine === selection.machine),
  ].filter(
    (item) =>
      item.sessionId === selection.sessionId &&
      (item.sessionId !== null || item.projectId === selection.projectId)
  )
}

export function unsentItems(prompts: UnsentPrompt[]) {
  return prompts
    .filter((item) => item.status !== 'queued')
    .map((item): UserItem => ({
      id: `${PREFIX}${item.id}`,
      parent: null,
      time: null,
      kind: 'user',
      text: item.prompt.text,
      images: item.prompt.images,
      format: 'text',
    }))
}

export function unsentId(item: UserItem) {
  return item.id.startsWith(PREFIX) ? item.id.slice(PREFIX.length) : null
}
