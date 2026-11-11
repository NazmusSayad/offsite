import type { PromptDelivery } from '@offsite/core/config'
import { DisconnectedError } from '@/api/connection'
import { uploadFile } from '@/api/upload'
import { addPending, takePending } from '@/lib/pending'
import { sendPrompt } from '@/lib/sessions'
import { draftKey, getState, type PendingPrompt, showError } from '@/lib/store'
import { restoredDraft } from './attached-images'
import {
  editDraft,
  fileMarker,
  getDraft,
  hasPrompt,
  loadDraftFile,
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
  let text = draft.text.trim()
  for (const file of draft.files) {
    const saved = await loadDraftFile(file.id)
    if (saved === undefined) {
      throw new Error(`${file.name} is no longer saved, attach it again`)
    }
    const path = await uploadFile(selection.machine, saved)
    text = text.replace(fileMarker(file), () => `@${path}`)
  }
  const prompt = {
    text,
    images: draft.images.map((image) => ({
      mediaType: image.mediaType,
      data: image.data,
    })),
  }
  editDraft(key, (current) => ({ ...current, text: '', images: [], files: [] }))
  const id = addPending(selection, prompt, delivery)
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
    restoreDraft(takePending(id))
    showError(error)
    return
  }
  takePending(id)
}

export function settleDisconnected(machine: string) {
  for (const id of disconnected) {
    const item = getState().pending.find((pending) => pending.id === id)
    if (item === undefined) {
      disconnected.delete(id)
      continue
    }
    if (item.machine === machine) {
      disconnected.delete(id)
      restoreDraft(takePending(id))
    }
  }
}

function restoreDraft(failed: PendingPrompt | undefined) {
  if (failed === undefined) {
    return
  }
  const key = draftKey(failed)
  if (hasPrompt(getDraft(key))) {
    stashPrompt(key)
  }
  editDraft(key, (current) => ({
    ...current,
    ...restoredDraft(failed.prompt),
  }))
}
