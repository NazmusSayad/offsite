import type { PromptDelivery } from '@offsite/core/config'
import { uploadFile } from '@/api/upload'
import { addPending, markSent, shownIds, takePending } from '@/lib/pending'
import { sendPrompt } from '@/lib/sessions'
import { draftKey, getState, showError } from '@/lib/store'
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
  const state = getState()
  const selection = state.selection
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
  const id = addPending(selection, prompt, delivery, shownIds(state))
  void deliver(
    id,
    sendPrompt(prompt, delivery, selection, state.settings, status)
  )
}

async function deliver(id: string, request: Promise<void>) {
  try {
    await request
  } catch (error) {
    const failed = takePending(id)
    if (failed !== undefined) {
      const key = draftKey(failed)
      if (hasPrompt(getDraft(key))) {
        stashPrompt(key)
      }
      editDraft(key, (current) => ({
        ...current,
        ...restoredDraft(failed.prompt),
      }))
    }
    showError(error)
    return
  }
  markSent(id)
}
