import type { PromptDelivery } from '@offsite/core/config'
import type { Prompt, OutboxPrompt } from '@offsite/core/items'
import { editDraft } from '@/features/composer/drafts'
import type { UserItem } from '@/features/transcript/timeline'
import { openSession } from './sessions'
import {
  activityOf,
  getState,
  type Machine,
  type MachineSession,
  type Selection,
  setMachine,
  type State,
  update,
} from './store'

const PREFIX = 'outbox:'
const none: OutboxPrompt[] = []

export function receiveOutbox(machine: string, outbox: OutboxPrompt[]) {
  setMachine(machine, { outbox })
  const local = getState().outbox
  const left = local.filter(
    (item) => !outbox.some((saved) => saved.id === item.id)
  )
  if (left.length !== local.length) {
    update({ outbox: left })
  }
  const received = local.find(
    (item) =>
      item.machine === machine &&
      item.sessionId === null &&
      !left.includes(item)
  )
  if (received !== undefined) {
    editDraft('new', (current) => ({
      ...current,
      text: '',
      images: [],
      files: [],
    }))
  }
  const selection = getState().selection
  if (selection === null || selection.machine !== machine) {
    return
  }
  if (selection.sessionId === null && selection.pending === null) {
    if (received !== undefined && received.projectId === selection.projectId) {
      update({ selection: { ...selection, pending: received.id } })
    }
    return
  }
  if (selection.pending === null) {
    return
  }
  const saved = outbox.find((item) => item.id === selection.pending)
  if (saved === undefined) {
    openSession({ ...selection, pending: null }, null, true)
    return
  }
  if (saved.sessionId !== null) {
    openSession(
      {
        machine,
        projectId: saved.projectId,
        sessionId: saved.sessionId,
        pending: null,
      },
      null,
      true
    )
  }
}

export function moveStartedPrompt(
  machine: string,
  id: string,
  sessionId: string,
  projectId: string
) {
  const saved =
    getState().machines.find((item) => item.id === machine)?.outbox ?? none
  setMachine(machine, {
    outbox: saved.map((item) =>
      item.id === id ? { ...item, sessionId, projectId } : item
    ),
  })
}

export function addToOutbox(
  selection: Selection,
  prompt: Prompt,
  delivery: PromptDelivery,
  status: 'active' | 'snoozed' | null
) {
  const state = getState()
  const id = crypto.randomUUID()
  update({
    outbox: [
      ...state.outbox,
      {
        id,
        machine: selection.machine,
        projectId: selection.projectId,
        sessionId: selection.sessionId,
        provider: state.settings.provider,
        prompt,
        status:
          delivery === 'queue' &&
          activityOf(state.machines, selection.machine, selection.sessionId)
            ?.running === true
            ? 'queued'
            : 'sending',
        snoozed: status === 'snoozed',
        createdAt: Date.now(),
      },
    ],
  })
  return id
}

export function takeFromOutbox(id: string) {
  const local = getState().outbox
  update({ outbox: local.filter((item) => item.id !== id) })
  return local.find((item) => item.id === id)
}

export function savedOutbox(state: State) {
  return (
    state.machines.find((machine) => machine.id === state.selection?.machine)
      ?.outbox ?? none
  )
}

export function selectedPrompts(state: State): OutboxPrompt[] {
  const selection = state.selection
  if (selection === null) {
    return []
  }
  const prompts = [
    ...(state.loaded ? savedOutbox(state) : []),
    ...state.outbox.filter((item) => item.machine === selection.machine),
  ]
  if (selection.sessionId !== null) {
    return prompts.filter((item) => item.sessionId === selection.sessionId)
  }
  if (selection.pending !== null) {
    return prompts.filter((item) => item.id === selection.pending)
  }
  return []
}

export function startingThread(state: State) {
  return state.outbox.some((item) => item.sessionId === null)
}

export function outboxItems(prompts: OutboxPrompt[]) {
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

export function outboxId(item: UserItem) {
  return item.id.startsWith(PREFIX) ? item.id.slice(PREFIX.length) : null
}

export function outboxChats(machines: Machine[]) {
  return machines
    .flatMap((machine) =>
      machine.outbox.map((item) => ({ ...item, machine: machine.id }))
    )
    .filter((item) => item.sessionId === null)
    .map((item): MachineSession => ({
      machine: item.machine,
      id: `${PREFIX}${item.id}`,
      provider: item.provider,
      title: item.prompt.text === '' ? 'New thread' : item.prompt.text,
      projectId: item.projectId,
      branch: null,
      updatedAt: item.createdAt,
      status: item.snoozed ? 'snoozed' : 'active',
      claudeWorktree: false,
    }))
}

export function chatSessionId(id: string) {
  return id.startsWith(PREFIX) ? null : id
}

export function chatSelection(
  machine: string,
  projectId: string,
  id: string
): Selection {
  if (id.startsWith(PREFIX)) {
    return {
      machine,
      projectId,
      sessionId: null,
      pending: id.slice(PREFIX.length),
    }
  }
  return { machine, projectId, sessionId: id, pending: null }
}

export function chatSelected(
  selection: Selection | null,
  session: MachineSession
) {
  const target = chatSelection(session.machine, session.projectId, session.id)
  return (
    selection !== null &&
    selection.machine === target.machine &&
    selection.sessionId === target.sessionId &&
    selection.pending === target.pending
  )
}

export function pendingTitle(state: State) {
  const pending = state.selection?.pending ?? null
  if (pending === null) {
    return null
  }
  return (
    outboxChats(state.machines).find(
      (chat) => chat.id === `${PREFIX}${pending}`
    )?.title ?? null
  )
}

export function notSent(state: State, session: MachineSession) {
  return state.machines.some(
    (machine) =>
      machine.id === session.machine &&
      machine.outbox.some(
        (item) =>
          item.status === 'failed' &&
          (item.sessionId === session.id ||
            `${PREFIX}${item.id}` === session.id)
      )
  )
}
