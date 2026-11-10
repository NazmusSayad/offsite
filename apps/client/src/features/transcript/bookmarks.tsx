import {
  BookmarkAdd02Icon,
  BookmarkCheck02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { BookmarkTarget } from '@offsite/core/bookmarks'
import type { Item } from '@offsite/core/items'
import { type RefObject, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { renderedRange } from '@/features/transcript/anchors'
import type { Row } from '@/features/transcript/timeline'
import { toggleBookmark, useBookmarked } from '@/lib/bookmarks'
import { loadEarlier } from '@/lib/sessions'
import { showError, update, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function MessageBookmarkButton(props: { itemId: string }) {
  const selection = useStore((state) => state.selection)
  if (selection === null || selection.sessionId === null) {
    return null
  }
  return (
    <BookmarkToggle
      machine={selection.machine}
      target={{
        sessionId: selection.sessionId,
        itemId: props.itemId,
        start: null,
        end: null,
      }}
    />
  )
}

function BookmarkToggle(props: { machine: string; target: BookmarkTarget }) {
  const bookmarked = useBookmarked(props.machine, props.target)
  return (
    <Tooltip label={bookmarked ? 'Remove bookmark' : 'Bookmark message'}>
      <Button
        type="button"
        size="icon-micro"
        variant="ghost-muted"
        aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark message'}
        aria-pressed={bookmarked}
        onClick={() => toggleBookmark(props.machine, props.target)}
      >
        <HugeiconsIcon
          icon={bookmarked ? BookmarkCheck02Icon : BookmarkAdd02Icon}
          className={cn('size-4', bookmarked && 'text-primary')}
        />
      </Button>
    </Tooltip>
  )
}

export function useBookmarks(props: {
  content: RefObject<HTMLDivElement | null>
  scroller: RefObject<HTMLDivElement | null>
  rows: Row[]
  onJump: (key: string) => void
}) {
  const selection = useStore((state) => state.selection)
  const bookmarks = useStore(
    (state) =>
      state.machines.find((machine) => machine.id === state.selection?.machine)
        ?.bookmarks
  )
  const items = useStore((state) => state.items)
  const earlier = useStore((state) => state.earlier)
  const loaded = useStore((state) => state.loaded)
  const before = useStore((state) => state.before)
  const focus = useStore((state) => state.focus)
  const found =
    focus !== null && props.rows.some((row) => row.key === focus.itemId)

  useEffect(() => {
    const root = props.content.current
    if (root === null) {
      throw new Error('transcript is not mounted')
    }
    const marked = (bookmarks ?? []).filter(
      (bookmark) =>
        bookmark.sessionId === selection?.sessionId && bookmark.start !== null
    )
    const all = [...earlier, ...items]
    let frame = 0
    function paint() {
      if (root === null) {
        throw new Error('transcript is not mounted')
      }
      const ranges = marked.flatMap((bookmark) => {
        const range = excerptRange(root, bookmark, all)
        return range === null ? [] : [range]
      })
      CSS.highlights.set('bookmark', new Highlight(...ranges))
    }
    paint()
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(paint)
    })
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      CSS.highlights.delete('bookmark')
    }
  }, [props.content, bookmarks, selection?.sessionId, items, earlier])

  useEffect(() => {
    if (focus === null || !loaded) {
      return
    }
    if (focus.itemId === null) {
      throw new Error('a session bookmark has no message to show')
    }
    const selector = `[data-row="${CSS.escape(focus.itemId)}"]`
    if (found) {
      if (props.content.current?.querySelector(selector) === null) {
        props.onJump(focus.itemId)
      }
      update({ focus: null })
      setTimeout(() => {
        const root = props.content.current
        const scroller = props.scroller.current
        const row = root?.querySelector(selector)
        if (root === null || scroller === null || !(row instanceof Element)) {
          throw new Error('the bookmarked message is not on screen')
        }
        const range =
          focus.start === null
            ? null
            : excerptRange(root, focus, [...earlier, ...items])
        const target = range ?? row
        const box = target.getBoundingClientRect()
        const view = scroller.getBoundingClientRect()
        scroller.scrollBy({
          top:
            box.top - view.top - Math.max(24, (view.height - box.height) / 3),
          behavior: 'smooth',
        })
        if (range === null) {
          row.animate(
            [
              {
                backgroundColor:
                  'color-mix(in srgb, var(--primary) 18%, transparent)',
              },
              { backgroundColor: 'transparent' },
            ],
            { duration: 2400, easing: 'ease-out' }
          )
        }
      }, 60)
      return
    }
    if (before !== null) {
      void loadEarlier()
      return
    }
    update({ focus: null })
    showError(new Error('That message is no longer in the conversation'))
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, loaded, found, before])
}

function excerptRange(root: Element, bookmark: BookmarkTarget, items: Item[]) {
  const item = items.find((candidate) => candidate.id === bookmark.itemId)
  if (
    item === undefined ||
    (item.kind !== 'user' && item.kind !== 'assistant') ||
    bookmark.start === null ||
    bookmark.end === null
  ) {
    return null
  }
  const text = root.querySelector(
    `[data-row="${CSS.escape(item.id)}"] [data-message-text]`
  )
  if (text === null) {
    return null
  }
  return renderedRange(text, item.text, bookmark.start, bookmark.end)
}
