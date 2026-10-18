import type { PromptDelivery } from '@offsite/core/config'
import type { PermissionDecision, Prompt } from '@offsite/core/items'
import type { SessionPatch } from '@offsite/core/sessions'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { deleteDraft, getDraftSettings } from '@/features/composer/drafts'
import { providerSettings, refreshCapabilities, setAccounts } from './accounts'
import {
  draftKey,
  getState,
  machineOf,
  type Selection,
  showError,
  update,
} from './store'
import { syncUrl } from './url'
export function openSession(selection: Selection) {
  const machine = machineOf(getState(), selection.machine)
  update({
    selection,
    loaded: selection.sessionId === null,
    items: [],
    earlier: [],
    before: null,
    partial: '',
    requests: [],
    queue: [],
    settings:
      (selection.sessionId === null
        ? null
        : getDraftSettings(draftKey(selection))) ??
      providerSettings(
        machine.composer,
        getState().sessions.find(
          (item) =>
            item.machine === selection.machine &&
            item.id === selection.sessionId
        )?.provider ??
          machine.composer?.provider ??
          'claude'
      ),
    context: null,
    paletteOpen: false,
    unseen: getState().unseen.filter(
      (key) =>
        selection.sessionId === null ||
        key !== machineKey(selection.machine, selection.sessionId)
    ),
  })
  syncUrl()
  if (
    machine.claudeAccounts.length > 0 ||
    machine.codexAccounts.length > 0 ||
    machine.openCode.available
  ) {
    setAccounts(selection.machine, {
      claudeAccounts: machine.claudeAccounts,
      codexAccounts: machine.codexAccounts,
      openCode: machine.openCode,
    })
  }
  void refreshCapabilities()
  if (selection.sessionId !== null && machine.status === 'online') {
    call(selection.machine, 'sessions.open', {
      projectId: selection.projectId,
      sessionId: selection.sessionId,
    }).catch(showError)
  }
}

export async function sendPrompt(prompt: Prompt, delivery: PromptDelivery) {
  const selection = getState().selection
  if (selection === null) {
    throw new Error('no session selected')
  }
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission()
  }
  update({ sentAt: Date.now() })
  await call(selection.machine, 'sessions.send', {
    sessionId: selection.sessionId,
    projectId: selection.projectId,
    prompt,
    settings: getState().settings,
    delivery,
  })
}

export function unqueue(id: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  call(selection.machine, 'sessions.unqueue', {
    sessionId: selection.sessionId,
    id,
  }).catch(showError)
}

export function steer(id: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  call(selection.machine, 'sessions.steer', {
    sessionId: selection.sessionId,
    id,
  }).catch(showError)
}

export function interrupt() {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  call(selection.machine, 'sessions.interrupt', {
    sessionId: selection.sessionId,
  }).catch(showError)
}

export function stopTask(machine: string, sessionId: string, taskId: string) {
  call(machine, 'sessions.stopTask', { sessionId, taskId }).catch(showError)
}

export function respond(
  requestId: string,
  decision: PermissionDecision,
  answers: Record<string, string> | null
) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  call(selection.machine, 'sessions.respond', {
    sessionId: selection.sessionId,
    requestId,
    decision,
    answers,
  }).catch(showError)
}

export async function forkFrom(messageId: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  try {
    const result = await call(selection.machine, 'sessions.fork', {
      sessionId: selection.sessionId,
      projectId: selection.projectId,
      messageId,
    })
    openSession({ ...selection, sessionId: result.sessionId })
  } catch (error) {
    showError(error)
  }
}

export async function loadEarlier() {
  const selection = getState().selection
  const before = getState().before
  if (selection === null || selection.sessionId === null || before === null) {
    return
  }
  try {
    const result = await call(selection.machine, 'sessions.earlier', {
      sessionId: selection.sessionId,
      before,
    })
    if (getState().selection !== selection || getState().before !== before) {
      return
    }
    update({
      earlier: [...result.items, ...getState().earlier],
      before: result.before,
    })
  } catch (error) {
    showError(error)
  }
}

export async function loadAgent(parent: string, agentId: string) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    return
  }
  try {
    const loaded = await call(selection.machine, 'sessions.agent', {
      sessionId: selection.sessionId,
      projectId: selection.projectId,
      agentId,
      parent,
    })
    if (getState().selection !== selection) {
      return
    }
    const ids = new Set(loaded.map((item) => item.id))
    const items = getState().items
    update({
      items: [
        ...items.filter((item) => item.parent !== parent),
        ...loaded,
        ...items.filter((item) => item.parent === parent && !ids.has(item.id)),
      ],
    })
  } catch (error) {
    showError(error)
  }
}

export async function editSession(
  machine: string,
  id: string,
  patch: SessionPatch
) {
  update({
    sessions: getState().sessions.map((item) =>
      item.machine === machine && item.id === id ? { ...item, ...patch } : item
    ),
  })
  const selection = getState().selection
  if (
    patch.status === 'inactive' &&
    selection?.machine === machine &&
    selection.sessionId === id
  ) {
    const latest = getState()
      .sessions.filter(
        (item) => item.status === 'pinned' || item.status === 'active'
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .at(0)
    openSession(
      latest === undefined
        ? { ...selection, sessionId: null }
        : {
            machine: latest.machine,
            projectId: latest.projectId,
            sessionId: latest.id,
          }
    )
  }
  try {
    await call(machine, 'sessions.update', { id, patch })
  } catch (error) {
    showError(error)
  }
}

export async function removeSession(machine: string, id: string) {
  update({
    sessions: getState().sessions.filter(
      (item) => item.machine !== machine || item.id !== id
    ),
  })
  deleteDraft(machineKey(machine, id))
  const selection = getState().selection
  if (selection?.machine === machine && selection.sessionId === id) {
    openSession({ ...selection, sessionId: null })
  }
  try {
    await call(machine, 'sessions.remove', { id })
  } catch (error) {
    showError(error)
  }
}
