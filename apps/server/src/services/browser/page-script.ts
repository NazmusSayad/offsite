import type { Frame } from 'playwright-core'

export const COPY_BINDING = '__offsiteCopy'

export const COPY_SCRIPT = `(() => {
  function report(text) {
    if (text !== '' && typeof window.${COPY_BINDING} === 'function') {
      window.${COPY_BINDING}(text)
    }
  }
  function selected() {
    const active = document.activeElement
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      return active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0)
    }
    return String(getSelection())
  }
  function copied(event) {
    report(event.defaultPrevented ? event.clipboardData.getData('text/plain') : selected())
  }
  addEventListener('copy', copied)
  addEventListener('cut', copied)
  const clipboard = navigator.clipboard
  if (clipboard !== undefined) {
    const writeText = clipboard.writeText
    clipboard.writeText = function (text) {
      report(String(text))
      return writeText.call(this, text)
    }
  }
})()`

export async function editableAt(
  frame: Frame,
  point: { x: number; y: number }
): Promise<boolean> {
  const hit = await frame.evaluateHandle(
    (at) => document.elementFromPoint(at.x, at.y),
    point
  )
  try {
    const element = hit.asElement()
    if (element === null) {
      return false
    }
    const inner = await element.contentFrame()
    if (inner === null) {
      return await element.evaluate(isEditable, NOT_TEXT)
    }
    const corner = await element.evaluate((iframe) => {
      const rect = iframe.getBoundingClientRect()
      const style = getComputedStyle(iframe)
      return {
        x: rect.left + iframe.clientLeft + Number.parseFloat(style.paddingLeft),
        y: rect.top + iframe.clientTop + Number.parseFloat(style.paddingTop),
      }
    })
    return await editableAt(inner, {
      x: point.x - corner.x,
      y: point.y - corner.y,
    })
  } finally {
    await hit.dispose()
  }
}

function isEditable(element: Element, notText: string[]) {
  if (element instanceof HTMLElement && element.isContentEditable) {
    return true
  }
  if (element instanceof HTMLTextAreaElement) {
    return true
  }
  return element instanceof HTMLInputElement && !notText.includes(element.type)
}

const NOT_TEXT = [
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]
