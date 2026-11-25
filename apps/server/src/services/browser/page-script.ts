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

export function editableAt(point: { x: number; y: number }) {
  return `(() => {
  const element = document.elementFromPoint(${point.x}, ${point.y})
  if (!(element instanceof HTMLElement)) {
    return false
  }
  if (element.isContentEditable || element instanceof HTMLTextAreaElement) {
    return true
  }
  return element instanceof HTMLInputElement && !${JSON.stringify(NOT_TEXT)}.includes(element.type)
})()`
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
