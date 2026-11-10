import type { PromptDelivery } from '@offsite/core/config'
import type { Prompt, StartingPrompt, UnsentPrompt } from '@offsite/core/items'
import type { UserItem } from '@/features/transcript/timeline'
import {
  activityOf,
  getState,
  type PendingPrompt,
  type Selection,
  type State,
  subscribe,
  update,
} from './store'

const PREFIX = 'unsent:'
const none: StartingPrompt[] = []

export function watchPending() {
  subscribe(() => {
    const state = getState()
    if (state.pending.length === 0) {
      return
    }
    const saved = new Set([
      ...state.queue.map((item) => item.id),
      ...state.machines.flatMap((machine) =>
        machine.starting.map((item) => item.id)
      ),
    ])
    const pending = state.pending.filter((item) => !saved.has(item.id))
    if (pending.length !== state.pending.length) {
      update({ pending })
    }
  })
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
        queued:
          delivery === 'queue' &&
          activityOf(state.machines, selection.machine, selection.sessionId)
            ?.running === true,
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

export function threadPrompts(
  queue: UnsentPrompt[],
  starting: StartingPrompt[],
  pending: PendingPrompt[],
  selection: Selection | null
): UnsentPrompt[] {
  if (selection === null) {
    return []
  }
  return [
    ...(selection.sessionId === null
      ? starting.filter((item) => item.projectId === selection.projectId)
      : queue),
    ...pending
      .filter((item) => inThread(item, selection))
      .map((item) => ({
        id: item.id,
        prompt: item.prompt,
        status: item.queued ? ('queued' as const) : ('sending' as const),
      })),
  ]
}

export function selectedPrompts(state: State) {
  return threadPrompts(
    state.queue,
    selectedStarting(state),
    state.pending,
    state.selection
  )
}

export function selectedStarting(state: State) {
  return (
    state.machines.find((machine) => machine.id === state.selection?.machine)
      ?.starting ?? none
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

function inThread(pending: PendingPrompt, selection: Selection) {
  return (
    pending.machine === selection.machine &&
    pending.sessionId === selection.sessionId &&
    (pending.sessionId !== null || pending.projectId === selection.projectId)
  )
}
