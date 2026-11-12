import type { Item, Prompt } from '@offsite/core/items'

export function lastImageNumber(items: Item[], texts: string[]) {
  let last = 0
  for (const text of [
    ...texts,
    ...items.flatMap((item) => {
      if (item.parent !== null) {
        return []
      }
      if (item.kind === 'user') {
        return [item.text]
      }
      if (item.kind === 'question' && item.answers !== null) {
        return Object.values(item.answers)
      }
      return []
    }),
  ]) {
    for (const match of text.matchAll(/\[Image #(\d+)\]/g)) {
      last = Math.max(last, Number(match[1]))
    }
  }
  return last
}

export function restoredDraft(prompt: Prompt) {
  const numbers = [
    ...new Set(
      [...prompt.text.matchAll(/\[Image #(\d+)\]/g)].map((match) =>
        Number(match[1])
      )
    ),
  ].sort((first, second) => first - second)
  if (numbers.length === prompt.images.length) {
    return {
      text: prompt.text,
      images: prompt.images.map((image, index) => ({
        ...image,
        number: numbers[index],
      })),
    }
  }
  const first = Math.max(0, ...numbers) + 1
  const images = prompt.images.map((image, index) => ({
    ...image,
    number: first + index,
  }))
  return {
    text: `${images.map((image) => `[Image #${image.number}] `).join('')}${prompt.text}`,
    images,
  }
}

export function largePaste(text: string, files: { number: number }[]) {
  if (new Blob([text]).size < 32 * 1024) {
    return null
  }
  const number = Math.max(0, ...files.map((file) => file.number)) + 1
  return new File([text], `pasted-text-${number}.txt`, { type: 'text/plain' })
}

export function isPasteInline(event: KeyboardEvent) {
  return (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    event.key.toLowerCase() === 'v'
  )
}

export function lastUserText(items: Item[]) {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (
      item.kind === 'user' &&
      item.parent === null &&
      item.format === 'text' &&
      item.text !== ''
    ) {
      return item.text
    }
  }
  return null
}
