import { diffChars } from 'diff'

function isPlain(char: string) {
  return !/[\s*_`#>~|\\[\]()-]/.test(char)
}

function plainText(text: string) {
  let plain = ''
  const offsets: number[] = []
  for (let index = 0; index < text.length; index++) {
    if (isPlain(text[index])) {
      plain += text[index]
      offsets.push(index)
    }
  }
  return { plain, offsets }
}

function renderedText(root: Element) {
  let plain = ''
  const places: { node: Text; offset: number }[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const text = node as Text
    for (let offset = 0; offset < text.data.length; offset++) {
      if (isPlain(text.data[offset])) {
        plain += text.data[offset]
        places.push({ node: text, offset })
      }
    }
  }
  return { plain, places }
}

function align(from: string, to: string) {
  const map: (number | null)[] = []
  let at = 0
  for (const part of diffChars(from, to)) {
    if (part.added) {
      at += part.value.length
      continue
    }
    for (let index = 0; index < part.value.length; index++) {
      map.push(part.removed ? null : at + index)
    }
    if (!part.removed) {
      at += part.value.length
    }
  }
  return map
}

export function sourceRange(root: Element, source: string, range: Range) {
  const plain = plainText(source)
  const rendered = renderedText(root)
  const map = align(rendered.plain, plain.plain)
  const mapped = rendered.places.flatMap((place, index) => {
    const target = map[index]
    return range.comparePoint(place.node, place.offset) === 0 &&
      range.comparePoint(place.node, place.offset + 1) === 0 &&
      target !== null
      ? [target]
      : []
  })
  const first = mapped.at(0)
  const last = mapped.at(-1)
  if (first === undefined || last === undefined) {
    return null
  }
  return { start: plain.offsets[first], end: plain.offsets[last] + 1 }
}

export function renderedRange(
  root: Element,
  source: string,
  start: number,
  end: number
) {
  const plain = plainText(source)
  const rendered = renderedText(root)
  const map = align(plain.plain, rendered.plain)
  const mapped = plain.offsets.flatMap((offset, index) => {
    const target = map[index]
    return offset >= start && offset < end && target !== null ? [target] : []
  })
  const first = mapped.at(0)
  const last = mapped.at(-1)
  if (first === undefined || last === undefined) {
    return null
  }
  const range = new Range()
  range.setStart(rendered.places[first].node, rendered.places[first].offset)
  range.setEnd(rendered.places[last].node, rendered.places[last].offset + 1)
  return range
}
