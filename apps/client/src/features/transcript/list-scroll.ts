import type { LegendListRef } from '@legendapp/list/react'

export async function settleListScroll(
  list: LegendListRef,
  target: (element: HTMLElement) => number | undefined
) {
  const element = list.getScrollableNode()
  if (!(element instanceof HTMLElement)) {
    throw new Error('transcript is not mounted')
  }
  let cancelled = false
  function cancel() {
    cancelled = true
  }
  const inputs = ['wheel', 'touchmove', 'pointerdown', 'keydown']
  for (const input of inputs) {
    element.addEventListener(input, cancel, { passive: true })
  }
  let stable = 0
  for (let frame = 0; frame < 60 && stable < 2 && !cancelled; frame++) {
    await nextFrame()
    const offset = target(element)
    if (offset === undefined || cancelled) {
      break
    }
    if (Math.abs(element.scrollTop - offset) > 1) {
      stable = 0
      await list.scrollToOffset({ offset, animated: false })
    } else {
      stable++
    }
  }
  for (const input of inputs) {
    element.removeEventListener(input, cancel)
  }
}

export async function scrollToEnd(list: LegendListRef) {
  await list.scrollToEnd({ animated: false })
  await settleListScroll(
    list,
    (element) => element.scrollHeight - element.clientHeight
  )
}

export async function scrollToRow(list: LegendListRef, key: string) {
  await settleListScroll(list, (element) => {
    const row = element.querySelector(`[data-row="${CSS.escape(key)}"]`)
    if (row === null) {
      return undefined
    }
    return Math.max(
      0,
      Math.min(
        element.scrollTop +
          row.getBoundingClientRect().top -
          element.getBoundingClientRect().top -
          24,
        element.scrollHeight - element.clientHeight
      )
    )
  })
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
