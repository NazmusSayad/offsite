import { toast } from 'sonner'
import { getState } from '@/lib/store'
import { mod } from '@/lib/utils'
import { lastImageNumber } from './attached-images'
import { moveComposerCaret } from './composer-input'
import {
  getDraft,
  getStash,
  hasPrompt,
  restoreStash,
  stashDraft,
} from './drafts'

export function stashPrompt(key: string) {
  stashDraft(key)
  toast.success('Prompt stashed', {
    description: `${mod}+S in an empty composer brings it back`,
  })
}

export function restorePrompt(key: string, id: string) {
  const text = restoreStash(key, id, lastImageNumber(getState().items, []))
  requestAnimationFrame(() => moveComposerCaret(text.length, true))
}

export function toggleStash(key: string) {
  if (hasPrompt(getDraft(key))) {
    stashPrompt(key)
    return
  }
  const newest = getStash().at(0)
  if (newest !== undefined) {
    restorePrompt(key, newest.id)
  }
}

export function isStashShortcut(event: KeyboardEvent) {
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    event.key.toLowerCase() === 's'
  )
}
