import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function ThreadFindBar(props: {
  content: RefObject<HTMLDivElement | null>
  scroller: RefObject<HTMLDivElement | null>
  onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const [matches, setMatches] = useState<Range[]>([])
  const current =
    matches.length === 0 ? -1 : Math.min(index, matches.length - 1)

  useEffect(() => input.current?.focus(), [])

  useEffect(() => {
    const element = props.content.current
    if (element === null) {
      throw new Error('transcript is not mounted')
    }
    if (query === '') {
      return
    }
    let frame = 0
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() =>
        setMatches(findRanges(element, query))
      )
    })
    observer.observe(element, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [query, props.content])

  useEffect(() => {
    if (matches.length === 0) {
      return
    }
    CSS.highlights.set('transcript-find', new Highlight(...matches))
    if (current !== -1) {
      CSS.highlights.set(
        'transcript-find-current',
        new Highlight(matches[current])
      )
    }
    return () => {
      CSS.highlights.delete('transcript-find')
      CSS.highlights.delete('transcript-find-current')
    }
  }, [matches, current])

  function search(nextQuery: string, nextIndex: number) {
    const content = props.content.current
    const scroller = props.scroller.current
    if (content === null || scroller === null) {
      throw new Error('transcript is not mounted')
    }
    const found = nextQuery === '' ? [] : findRanges(content, nextQuery)
    const position =
      found.length === 0 ? 0 : (nextIndex + found.length) % found.length
    setQuery(nextQuery)
    setIndex(position)
    setMatches(found)
    if (found.length === 0) {
      return
    }
    const rect = found[position].getBoundingClientRect()
    const box = scroller.getBoundingClientRect()
    if (rect.top < box.top + 48 || rect.bottom > box.bottom - 48) {
      scroller.scrollBy({ top: rect.top - box.top - box.height / 3 })
    }
  }

  return (
    <div
      data-transcript
      className="bg-card absolute top-2 right-6 z-30 flex items-center gap-1 rounded-lg border p-1 shadow-lg"
    >
      <Input
        ref={input}
        data-thread-find
        className="h-7 w-52"
        placeholder="Find in thread"
        aria-label="Find in thread"
        value={query}
        onChange={(event) => search(event.target.value, 0)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onClose()
            return
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            search(query, current + (event.shiftKey ? -1 : 1))
          }
        }}
      />
      <span className="text-muted-foreground w-16 text-center text-xs tabular-nums">
        {query === ''
          ? ''
          : matches.length === 0
            ? 'No results'
            : `${current + 1} of ${matches.length}`}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Previous match"
        onClick={() => search(query, current - 1)}
      >
        <HugeiconsIcon icon={ArrowUp01Icon} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Next match"
        onClick={() => search(query, current + 1)}
      >
        <HugeiconsIcon icon={ArrowDown01Icon} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close find"
        onClick={props.onClose}
      >
        <HugeiconsIcon icon={Cancel01Icon} />
      </Button>
    </div>
  )
}

function findRanges(root: HTMLElement, query: string) {
  const nodes: Text[] = []
  const starts: number[] = []
  let text = ''
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (node instanceof Text) {
      nodes.push(node)
      starts.push(text.length)
      text += node.data
    }
  }
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
  const ranges: Range[] = []
  let first = 0
  for (const match of text.matchAll(pattern)) {
    const end = match.index + match[0].length
    while (first + 1 < starts.length && starts[first + 1] <= match.index) {
      first++
    }
    let last = first
    while (last + 1 < starts.length && starts[last + 1] < end) {
      last++
    }
    const range = document.createRange()
    range.setStart(nodes[first], match.index - starts[first])
    range.setEnd(nodes[last], end - starts[last])
    if (range.getClientRects().length > 0) {
      ranges.push(range)
    }
  }
  return ranges
}
