import {
  BubbleChatIcon,
  Delete02Icon,
  Message01Icon,
  QuoteDownIcon,
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
        <li key={bookmark.id} className="group flex items-start gap-1 pr-2">
          <button
            type="button"
            className="hover:bg-accent/50 flex min-w-0 flex-1 items-start gap-3 px-5 py-3 text-left disabled:opacity-60"
            disabled={bookmark.session === null}
            onClick={() => openBookmark(machine, bookmark)}
          >
            <HugeiconsIcon
              icon={
                bookmark.itemId === null
                  ? BubbleChatIcon
                  : bookmark.start === null
                    ? Message01Icon
                    : QuoteDownIcon
              }
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
                <span className="line-clamp-3 text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {bookmark.start === null
                    ? bookmark.message.text.replace(/\*\*|__|`/g, '')
                    : `“${bookmark.message.text.replace(/\*\*|__|`/g, '')}”`}
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
                <span className="ml-auto shrink-0 tabular-nums">
                  {timeAgo(bookmark.createdAt)}
                </span>
              </span>
            </span>
          </button>
          <Button
            type="button"
            size="icon-micro"
            variant="ghost-muted"
            className="mt-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            aria-label="Remove bookmark"
            onClick={() =>
              void call(machine, 'bookmarks.remove', { id: bookmark.id }).catch(
                showError
              )
            }
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-4" />
          </Button>
        </li>
      ))}
    </ul>
  )
}
