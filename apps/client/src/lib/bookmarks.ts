import type { Bookmark, BookmarkTarget } from '@offsite/core/bookmarks'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { openSession } from './sessions'
import { getState, machineOf, showError, update, useStore } from './store'

function sameTarget(left: BookmarkTarget, right: BookmarkTarget) {
  return (
    left.sessionId === right.sessionId &&
    left.itemId === right.itemId &&
    left.start === right.start &&
    left.end === right.end
  )
}

export function useBookmarked(machine: string, target: BookmarkTarget) {
  return useStore(
    (state) =>
      state.machines
        .find((item) => item.id === machine)
        ?.bookmarks.some((bookmark) => sameTarget(bookmark, target)) === true
  )
}

export function toggleBookmark(machine: string, target: BookmarkTarget) {
  const existing = machineOf(getState(), machine).bookmarks.find((bookmark) =>
    sameTarget(bookmark, target)
  )
  if (existing === undefined) {
    call(machine, 'bookmarks.add', target)
      .then(() => toast('Bookmarked'))
      .catch(showError)
    return
  }
  call(machine, 'bookmarks.remove', { id: existing.id })
    .then(() => toast('Bookmark removed'))
    .catch(showError)
}

export function openBookmark(machine: string, bookmark: Bookmark) {
  if (bookmark.session === null) {
    throw new Error('that session no longer exists')
  }
  openSession({
    machine,
    projectId: bookmark.session.projectId,
    sessionId: bookmark.sessionId,
  })
  update({
    bookmarksOpen: false,
    focus: bookmark.itemId === null ? null : bookmark,
  })
}
