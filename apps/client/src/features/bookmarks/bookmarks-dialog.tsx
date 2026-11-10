import {
  BookmarkRemove02Icon,
  Chat01Icon,
  Message01Icon,
  QuoteDownIcon,
  Robot01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Bookmark } from '@offsite/core/bookmarks'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { openBookmark } from '@/lib/bookmarks'
import { timeAgo } from '@/lib/format'
import { showBookmarks, showError, useStore } from '@/lib/store'

export function BookmarksDialog() {
  const open = useStore((state) => state.bookmarksOpen)

  return (
    <Dialog open={open} onOpenChange={showBookmarks}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-lg"
        aria-describedby={undefined}
      >
        <DialogHeader className="px-5 pt-4 pr-12 pb-3">
          <DialogTitle>Bookmarks</DialogTitle>
        </DialogHeader>
        <BookmarkList />
      </DialogContent>
    </Dialog>
  )
}

function BookmarkList() {
  const machines = useStore((state) => state.machines)
  const projects = useStore((state) => state.projects)
  const [entries, setEntries] = useState<
    { machine: string; bookmark: Bookmark }[] | null
  >(null)
  const online = machines.filter((machine) => machine.status === 'online')
  const version = online
    .map(
      (machine) =>
        `${machine.id}:${machine.bookmarks.map((item) => item.id).join(',')}`
    )
    .join(' ')

  useEffect(() => {
    let current = true
    Promise.all(
      version
        .split(' ')
        .filter((entry) => entry !== '')
        .map(async (entry) => {
          const machine = entry.slice(0, entry.indexOf(':'))
          const bookmarks = await call(machine, 'bookmarks.list', undefined)
          return bookmarks.map((bookmark) => ({ machine, bookmark }))
        })
    )
      .then((lists) => {
        if (current) {
          setEntries(
            lists
              .flat()
              .sort(
                (left, right) =>
                  right.bookmark.createdAt - left.bookmark.createdAt
              )
          )
        }
      })
      .catch(showError)
    return () => {
      current = false
    }
  }, [version])

  if (entries === null) {
    return (
      <p className="text-muted-foreground border-t px-5 py-8 text-center text-xs">
        Loading…
      </p>
    )
  }
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground border-t px-5 py-8 text-center text-xs">
        Bookmark a session, a message or selected text to find it here
      </p>
    )
  }
  return (
    <ul className="max-h-[70dvh] divide-y overflow-y-auto border-t">
      {entries.map(({ machine, bookmark }) => (
        <li key={bookmark.id} className="relative">
          <button
            type="button"
            className="hover:bg-accent/50 flex w-full min-w-0 items-start gap-3 py-3 ps-5 pe-14 text-left disabled:opacity-60"
            disabled={bookmark.session === null}
            onClick={() => openBookmark(machine, bookmark)}
          >
            <HugeiconsIcon
              icon={bookmarkIcon(bookmark)}
              className="text-muted-foreground mt-0.5 size-4 shrink-0"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              {bookmark.itemId === null && (
                <span className="truncate text-sm font-medium">
                  {bookmark.session?.title ?? 'Session not found'}
                </span>
              )}
              {bookmark.itemId !== null && bookmark.message === null && (
                <span className="text-muted-foreground text-sm italic">
                  No longer in the conversation
                </span>
              )}
              {bookmark.message !== null && (
                <span className="line-clamp-3 text-sm [overflow-wrap:anywhere]">
                  {bookmark.start === null
                    ? previewText(bookmark.message.text)
                    : `“${previewText(bookmark.message.text)}”`}
                </span>
              )}
              <span className="text-muted-foreground flex min-w-0 gap-1.5 text-xs">
                {bookmark.message !== null && (
                  <span className="shrink-0">
                    {bookmark.message.author === 'user' ? 'You' : 'Agent'} ·
                  </span>
                )}
                {bookmark.itemId !== null && (
                  <span className="min-w-0 truncate">
                    {bookmark.session?.title ?? 'Session not found'}
                  </span>
                )}
                {bookmark.session !== null && (
                  <span className="min-w-0 shrink-0 truncate">
                    {projects.find(
                      (project) =>
                        project.machine === machine &&
                        project.id === bookmark.session?.projectId
                    )?.name ?? ''}
                  </span>
                )}
              </span>
            </span>
          </button>
          <div className="pointer-events-none absolute top-1/2 right-3 flex -translate-y-1/2 flex-col items-center">
            <Button
              type="button"
              size="icon-xs"
              variant="ghost-muted"
              className="pointer-events-auto"
              aria-label="Remove bookmark"
              onClick={() =>
                void call(machine, 'bookmarks.remove', {
                  id: bookmark.id,
                }).catch(showError)
              }
            >
              <HugeiconsIcon icon={BookmarkRemove02Icon} className="size-5" />
            </Button>
            <span className="text-muted-foreground text-2xs tabular-nums">
              {timeAgo(bookmark.createdAt)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}

function bookmarkIcon(bookmark: Bookmark) {
  if (bookmark.itemId === null) {
    return Chat01Icon
  }
  if (bookmark.start !== null) {
    return QuoteDownIcon
  }
  if (bookmark.message === null) {
    return Message01Icon
  }
  switch (bookmark.message.author) {
    case 'user':
      return UserIcon
    case 'assistant':
      return Robot01Icon
  }
}

function previewText(text: string) {
  return text
    .replace(/\*\*|__|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
