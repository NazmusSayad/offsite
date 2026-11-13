import type {
  Bookmark,
  BookmarkRef,
  BookmarkTarget,
} from '@offsite/core/bookmarks'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { openSession } from './sessions'
import {
  getState,
  machineOf,
  setMachine,
  showError,
  update,
  useStore,
} from './store'

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
    pending: null,
  })
  update({
    bookmarksOpen: false,
    focus: bookmark.itemId === null ? null : bookmark,
  })
}

export function receiveBookmarks(machine: string, bookmarks: BookmarkRef[]) {
  const loaded = machineOf(getState(), machine).bookmarkList
  if (
    loaded !== null &&
    bookmarks.every((ref) => loaded.some((item) => item.id === ref.id))
  ) {
    setMachine(machine, {
      bookmarks,
      bookmarkList: loaded.filter((item) =>
        bookmarks.some((ref) => ref.id === item.id)
      ),
    })
    return
  }
  setMachine(machine, { bookmarks })
  call(machine, 'bookmarks.list', undefined)
    .then((list) => {
      const current = machineOf(getState(), machine).bookmarks
      if (
        list.length === current.length &&
        list.every((item) => current.some((ref) => ref.id === item.id))
      ) {
        setMachine(machine, { bookmarkList: list })
      }
    })
    .catch(showError)
}
