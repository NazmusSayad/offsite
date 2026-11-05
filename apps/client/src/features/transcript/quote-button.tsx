import { QuoteDownIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type RefObject, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { editDraft } from '@/features/composer/drafts'
import { draftKey, getState } from '@/lib/store'

export function QuoteButton(props: {
  scroller: RefObject<HTMLDivElement | null>
}) {
  const [quote, setQuote] = useState<{
    text: string
    top: number
    left: number
  } | null>(null)

  useEffect(() => {
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
      const range = selected.getRangeAt(0)
      const text = selected.toString().trim()
      if (
        text === '' ||
        !isQuotable(range.startContainer, element) ||
        !isQuotable(range.endContainer, element)
      ) {
        setQuote(null)
        return
      }
      const rect = range.getBoundingClientRect()
      const box = element.getBoundingClientRect()
      setQuote({
        text,
        top: rect.bottom - box.top + element.scrollTop + 6,
        left: Math.min(
          Math.max(rect.left + rect.width / 2 - box.left, 48),
          box.width - 48
        ),
      })
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [props.scroller])

  if (quote === null) {
    return null
  }
  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      className="bg-[color-mix(in_srgb,var(--bg)_65%,black)] dark:bg-[color-mix(in_srgb,var(--bg)_65%,black)] border-[color-mix(in_srgb,var(--bg)_85%,black)] hover:bg-accent dark:hover:bg-accent absolute z-20 -translate-x-1/2 shadow-md"
      style={{ top: quote.top, left: quote.left }}
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
  )
}

function isQuotable(node: Node, root: HTMLElement) {
  const element = node instanceof Element ? node : node.parentElement
  return (
    element !== null &&
    root.contains(element) &&
    element.closest('[data-quotable]') !== null
  )
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
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLTextAreaElement>('[data-composer]')
    if (input === null) {
      throw new Error('the composer is not mounted')
    }
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  })
}
