import { BookmarkAdd02Icon, QuoteDownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { BookmarkTarget } from '@offsite/core/bookmarks'
import { type RefObject, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { moveComposerCaret } from '@/features/composer/composer-input'
import { editDraft, getDraft } from '@/features/composer/drafts'
import { sourceRange } from '@/features/transcript/anchors'
import { toggleBookmark } from '@/lib/bookmarks'
import { draftKey, getState } from '@/lib/store'

export function QuoteButton(props: {
  scroller: RefObject<HTMLDivElement | null>
}) {
  const [quote, setQuote] = useState<{
    text: string
    quotable: boolean
    bookmark: { machine: string; target: BookmarkTarget } | null
    top: number
    left: number
  } | null>(null)

  useEffect(() => {
    let pressed = false
    let clicks = 0
    let pointer: { x: number; y: number } | null = null
    function update() {
      const element = props.scroller.current
      const selected = window.getSelection()
      if (
        element === null ||
        selected === null ||
        selected.isCollapsed ||
        selected.rangeCount === 0
      ) {
        setQuote(null)
        return
      }
      if (pressed) {
        if (clicks < 2) {
          setQuote(null)
        }
        return
      }
      const original = selected.getRangeAt(0)
      if (!element.contains(original.commonAncestorContainer)) {
        setQuote(null)
        return
      }
      const parts = textParts(original)
      const first = parts.at(0)
      const last = parts.at(-1)
      const text = selected.toString().trim()
      if (first === undefined || last === undefined || text === '') {
        setQuote(null)
        return
      }
      const range = document.createRange()
      range.setStart(first.node, first.start)
      range.setEnd(last.node, last.end)
      const quotable =
        isQuotable(range.startContainer, element) &&
        isQuotable(range.endContainer, element)
      const bookmark = bookmarkOf(range)
      if (!quotable && bookmark === null) {
        setQuote(null)
        return
      }
      const lines = parts.flatMap((part) => {
        const piece = document.createRange()
        piece.setStart(part.node, part.start)
        piece.setEnd(part.node, part.end)
        return [...piece.getClientRects()].filter((rect) => rect.width > 0)
      })
      if (lines.length === 0) {
        setQuote(null)
        return
      }
      const forward =
        original.endContainer === selected.focusNode &&
        original.endOffset === selected.focusOffset
      const edge = forward ? lines[lines.length - 1] : lines[0]
      const target = pointer ?? {
        x: forward ? edge.right : edge.left,
        y: edge.top + edge.height / 2,
      }
      const line = nearestLine(lines, target)
      const box = element.getBoundingClientRect()
      setQuote({
        text,
        quotable,
        bookmark,
        top: line.bottom - box.top + element.scrollTop + 6,
        left: Math.min(
          Math.max(
            Math.min(Math.max(target.x, line.left), line.right) - box.left,
            48
          ),
          box.width - 48
        ),
      })
    }
    function press(event: PointerEvent) {
      pressed = true
      clicks = event.detail
      pointer = null
    }
    function release(event: PointerEvent) {
      pressed = false
      pointer = { x: event.clientX, y: event.clientY }
      update()
    }
    function type() {
      pointer = null
    }
    document.addEventListener('selectionchange', update)
    document.addEventListener('pointerdown', press)
    document.addEventListener('pointerup', release)
    document.addEventListener('pointercancel', release)
    document.addEventListener('keydown', type)
    return () => {
      document.removeEventListener('selectionchange', update)
      document.removeEventListener('pointerdown', press)
      document.removeEventListener('pointerup', release)
      document.removeEventListener('pointercancel', release)
      document.removeEventListener('keydown', type)
    }
  }, [props.scroller])

  if (quote === null) {
    return null
  }
  const bookmark = quote.bookmark
  return (
    <div
      className="animate-in fade-in-0 zoom-in-95 absolute z-20 flex -translate-x-1/2 overflow-hidden rounded-[var(--control-radius)] border border-[color-mix(in_srgb,var(--bg)_85%,var(--text))] bg-[color-mix(in_srgb,var(--bg)_65%,black)] shadow-md duration-25 ease-out"
      style={{ top: quote.top, left: quote.left }}
    >
      {quote.quotable && (
        <Button
          type="button"
          size="xs"
          variant="ghost"
          className="rounded-none"
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            quoteInComposer(quote.text)
            window.getSelection()?.removeAllRanges()
            setQuote(null)
          }}
        >
          <HugeiconsIcon icon={QuoteDownIcon} />
          Quote
        </Button>
      )}
      {quote.quotable && bookmark !== null && (
        <span className="w-px bg-[color-mix(in_srgb,var(--bg)_85%,var(--text))]" />
      )}
      {bookmark !== null && (
        <Tooltip label="Bookmark">
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            className="rounded-none"
            aria-label="Bookmark"
            onPointerDown={(event) => event.preventDefault()}
            onClick={() => {
              toggleBookmark(bookmark.machine, bookmark.target)
              window.getSelection()?.removeAllRanges()
              setQuote(null)
            }}
          >
            <HugeiconsIcon icon={BookmarkAdd02Icon} />
          </Button>
        </Tooltip>
      )}
    </div>
  )
}

function bookmarkOf(range: Range) {
  const selection = getState().selection
  const start = messageText(range.startContainer)
  if (
    selection === null ||
    selection.sessionId === null ||
    start === null ||
    start !== messageText(range.endContainer)
  ) {
    return null
  }
  const itemId = start.closest('[data-row]')?.getAttribute('data-row')
  const item = [...getState().earlier, ...getState().items].find(
    (candidate) => candidate.id === itemId
  )
  if (
    item === undefined ||
    (item.kind !== 'user' && item.kind !== 'assistant')
  ) {
    return null
  }
  const excerpt = sourceRange(start, item.text, range)
  if (excerpt === null) {
    return null
  }
  return {
    machine: selection.machine,
    target: { sessionId: selection.sessionId, itemId: item.id, ...excerpt },
  }
}

function messageText(node: Node) {
  return elementOf(node)?.closest('[data-message-text]') ?? null
}

function isQuotable(node: Node, root: HTMLElement) {
  const element = elementOf(node)
  return (
    element !== null &&
    root.contains(element) &&
    element.closest('[data-quotable]') !== null
  )
}

function textParts(range: Range) {
  const root = range.commonAncestorContainer
  const nodes: Text[] = []
  if (root instanceof Text) {
    nodes.push(root)
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (
      let node = walker.nextNode();
      node !== null;
      node = walker.nextNode()
    ) {
      if (
        node instanceof Text &&
        range.intersectsNode(node) &&
        node.parentElement !== null &&
        getComputedStyle(node.parentElement).userSelect !== 'none'
      ) {
        nodes.push(node)
      }
    }
  }
  return nodes.flatMap((node) => {
    const start = node === range.startContainer ? range.startOffset : 0
    const end = node === range.endContainer ? range.endOffset : node.length
    return node.data.slice(start, end).trim() === ''
      ? []
      : [{ node, start, end }]
  })
}

function nearestLine(lines: DOMRect[], point: { x: number; y: number }) {
  return lines.reduce((best, line) => {
    const current = lineDistance(line, point)
    const previous = lineDistance(best, point)
    return current.y < previous.y ||
      (current.y === previous.y && current.x < previous.x)
      ? line
      : best
  })
}

function lineDistance(line: DOMRect, point: { x: number; y: number }) {
  return {
    y: Math.max(line.top - point.y, 0, point.y - line.bottom),
    x: Math.max(line.left - point.x, 0, point.x - line.right),
  }
}

function elementOf(node: Node) {
  return node instanceof Element ? node : node.parentElement
}

function quoteInComposer(text: string) {
  const selection = getState().selection
  if (selection === null) {
    throw new Error('no thread is open to quote into')
  }
  const quoted = text
    .split('\n')
    .map((line) => (line.trim() === '' ? '>' : `> ${line}`))
    .join('\n')
  editDraft(draftKey(selection), (current) => ({
    ...current,
    text:
      current.text.trim() === ''
        ? `${quoted}\n\n`
        : `${current.text.trimEnd()}\n\n${quoted}\n\n`,
  }))
  requestAnimationFrame(() =>
    moveComposerCaret(getDraft(draftKey(selection)).text.length, true)
  )
}
