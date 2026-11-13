import type { PromptDelivery } from '@offsite/core/config'
import { DisconnectedError } from '@/api/connection'
import { uploadFile } from '@/api/upload'
import { addToOutbox, takeFromOutbox } from '@/lib/outbox'
import { sendPrompt } from '@/lib/sessions'
import {
  draftKey,
  getState,
  type MachineOutboxPrompt,
  showError,
} from '@/lib/store'
import { restoredDraft } from './attached-images'
import {
  editDraft,
  fileMarker,
  getDraft,
  hasPrompt,
  loadDraftFile,
  usedAttachments,
} from './drafts'
import { stashPrompt } from './stash'

export async function sendDraft(
  key: string,
  delivery: PromptDelivery,
  status: 'active' | 'snoozed' | null
) {
  const selection = getState().selection
  if (selection === null) {
    throw new Error('no session selected')
  }
  const draft = getDraft(key)
  const used = usedAttachments(draft)
  let text = draft.text.trim()
  for (const file of used.files) {
    const saved = await loadDraftFile(file.id)
    if (saved === undefined) {
      throw new Error(`${file.name} is no longer saved, attach it again`)
    }
    const path = await uploadFile(selection.machine, saved)
    text = text.replace(fileMarker(file), () => `@${path}`)
  }
  const prompt = {
    text,
    images: used.images.map((image) => ({
      mediaType: image.mediaType,
      data: image.data,
    })),
  }
  if (selection.sessionId !== null || selection.pending !== null) {
    editDraft(key, (current) => ({
      ...current,
      text: '',
      images: [],
      files: [],
    }))
  }
  const id = addToOutbox(selection, prompt, delivery, status)
  void deliver(id, sendPrompt(id, prompt, delivery, selection, status))
}

const disconnected = new Set<string>()

async function deliver(id: string, request: Promise<void>) {
  try {
    await request
  } catch (error) {
    if (error instanceof DisconnectedError) {
      disconnected.add(id)
      return
    }
    restoreDraft(takeFromOutbox(id))
    showError(error)
    return
  }
  takeFromOutbox(id)
}

export function settleDisconnected(machine: string) {
  for (const id of disconnected) {
    const item = getState().outbox.find((other) => other.id === id)
    if (item === undefined) {
      disconnected.delete(id)
      continue
    }
    if (item.machine === machine) {
      disconnected.delete(id)
      restoreDraft(takeFromOutbox(id))
    }
  }
}

function restoreDraft(failed: MachineOutboxPrompt | undefined) {
  if (failed === undefined || failed.sessionId === null) {
    return
  }
  const key = draftKey({
    machine: failed.machine,
    projectId: failed.projectId,
    sessionId: failed.sessionId,
    pending: null,
  })
  if (hasPrompt(getDraft(key))) {
    stashPrompt(key)
  }
  editDraft(key, (current) => ({
    ...current,
    ...restoredDraft(failed.prompt),
  }))
}
