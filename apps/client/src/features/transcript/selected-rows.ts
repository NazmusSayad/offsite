import { type RefObject, useEffect, useState } from 'react'

export function useSelectedRows(scroller: RefObject<HTMLDivElement | null>) {
  const [selected, setSelected] = useState<{
    first: string
    last: string
  } | null>(null)

  useEffect(() => {
    function update() {
      const element = scroller.current
      const selection = window.getSelection()
      if (
        element === null ||
        selection === null ||
        selection.isCollapsed ||
        selection.rangeCount === 0
      ) {
        setSelected(null)
        return
      }
      const range = selection.getRangeAt(0)
      const first = rowKeyOf(range.startContainer, element)
      const last = rowKeyOf(range.endContainer, element)
      if (first === null || last === null) {
        setSelected(null)
        return
      }
      setSelected((current) =>
        current?.first === first && current.last === last
          ? current
          : { first, last }
      )
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [scroller])

  return selected
}

function rowKeyOf(node: Node, root: HTMLElement) {
  const element = node instanceof Element ? node : node.parentElement
  const row = element?.closest('[data-row]')
  if (row === null || row === undefined || !root.contains(row)) {
    return null
  }
  return row.getAttribute('data-row')
}
