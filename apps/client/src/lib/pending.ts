import type { PromptDelivery } from '@offsite/core/config'
import type { Prompt } from '@offsite/core/items'
import { listen } from '@/api/connection'
import { getDraft, hasPrompt, moveDraft } from '@/features/composer/drafts'
import type { UserItem } from '@/features/transcript/timeline'
import {
  activityOf,
  draftKey,
  getState,
  type PendingPrompt,
  type Selection,
  type State,
  subscribe,
  update,
} from './store'

const PREFIX = 'pending:'

export function watchPending() {
  subscribe(() => {
    const state = getState()
    if (state.pending.length === 0) {
      return
    }
    const pending = unsettled(state)
    if (pending.length !== state.pending.length) {
      update({ pending })
    }
  })
  listen({
    event: (machine, event) => {
      if (event.type !== 'started') {
        return
      }
      const pending = getState().pending
      const started = pending.find(
        (item) =>
          item.machine === machine &&
          item.sessionId === null &&
          item.projectId === event.from
      )
      if (started === undefined) {
        return
      }
      update({
        pending: pending.map((item) =>
          item === started
            ? {
                ...item,
                projectId: event.projectId,
                sessionId: event.sessionId,
              }
            : item
        ),
      })
      const selection = getState().selection
      if (
        selection?.machine === machine &&
        selection.sessionId === event.sessionId &&
        hasPrompt(getDraft(draftKey(started)))
      ) {
        moveDraft(draftKey(started), draftKey(selection))
      }
    },
  })
}

export function addPending(
  selection: Selection,
  prompt: Prompt,
  delivery: PromptDelivery,
  seen: string[]
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
        seen,
        sent: false,
      },
    ],
  })
  return id
}

export function markSent(id: string) {
  update({
    pending: getState().pending.map((item) =>
      item.id === id ? { ...item, sent: true } : item
    ),
  })
}

export function takePending(id: string) {
  const pending = getState().pending
  update({ pending: pending.filter((item) => item.id !== id) })
  return pending.find((item) => item.id === id)
}

export function shownIds(state: State) {
  return [
    ...state.items
      .filter((item) => item.kind === 'user' && item.parent === null)
      .map((item) => item.id),
    ...state.queue.map((item) => item.id),
  ]
}

export function inThread(pending: PendingPrompt, selection: Selection | null) {
  return (
    selection !== null &&
    pending.machine === selection.machine &&
    pending.sessionId === selection.sessionId &&
    (pending.sessionId !== null || pending.projectId === selection.projectId)
  )
}

export function hasPending(state: State) {
  return state.pending.some((item) => inThread(item, state.selection))
}

export function pendingItems(
  pending: PendingPrompt[],
  selection: Selection | null
) {
  return pending
    .filter((item) => !item.queued && inThread(item, selection))
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

export function isPending(item: UserItem) {
  return item.id.startsWith(PREFIX)
}

function unsettled(state: State) {
  const shown = shownIds(state)
  const claimed = new Set<string>()
  return state.pending.filter((pending) => {
    if (
      pending.sent &&
      pending.sessionId !== null &&
      activityOf(state.machines, pending.machine, pending.sessionId)
        ?.running !== true
    ) {
      return false
    }
    if (!inThread(pending, state.selection)) {
      return true
    }
    const echo = shown.find(
      (id) => !pending.seen.includes(id) && !claimed.has(id)
    )
    if (echo === undefined) {
      return true
    }
    claimed.add(echo)
    return false
  })
}
