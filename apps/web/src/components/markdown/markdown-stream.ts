type Point = { line: number; column: number; offset?: number }

type MarkdownNode = {
  type: string
  position?: { start: Point; end: Point }
  children?: MarkdownNode[]
}

type Parse = (document: string, file: never) => MarkdownNode

type Prefix = {
  source: string
  offset: number
  line: number
  children: MarkdownNode[]
}

export function streamingParser() {
  let cached: Prefix | null = null
  return function (this: { parser?: Parse }) {
    const parse = this.parser
    if (parse === undefined) {
      throw new Error('Markdown parser is missing')
    }
    this.parser = (source, file) => {
      const result = parseFrom(parse, cached, source, file)
      if (result.cached !== null) {
        cached = result.cached
      }
      return result.root
    }
  }
}

function parseFrom(
  parse: Parse,
  cached: Prefix | null,
  source: string,
  file: never
) {
  if (source.includes('\r') || source.includes('﻿')) {
    return { root: parse(source, file), cached: null }
  }
  const prefix =
    cached !== null && source.startsWith(cached.source) ? cached : null
  const root = parse(
    prefix === null ? source : source.slice(prefix.offset),
    file
  )
  const children = root.children
  if (children === undefined) {
    throw new Error('Markdown root has no children')
  }
  if (hasDefinitions(root)) {
    return { root: prefix === null ? root : parse(source, file), cached: null }
  }
  if (prefix !== null) {
    shiftPositions(root, prefix.offset, prefix.line - 1)
    if (root.position !== undefined) {
      root.position.start = { line: 1, column: 1, offset: 0 }
    }
    children.unshift(...structuredClone(prefix.children))
  }
  for (let index = children.length - 1; index >= 0; index--) {
    const node = children[index]
    const position = node.position
    if (
      node.type !== 'code' ||
      position === undefined ||
      position.start.offset === undefined ||
      position.end.offset === undefined
    ) {
      continue
    }
    if (prefix !== null && position.end.offset < prefix.offset) {
      break
    }
    const value = source.slice(position.start.offset, position.end.offset)
    const opening = /^ {0,3}(`{3,}|~{3,})[^\n]*\n/.exec(value)?.[1]
    const separator = /^\n[ \t]*\n/.exec(source.slice(position.end.offset))?.[0]
    if (opening === undefined || separator === undefined) {
      continue
    }
    const closing = new RegExp(
      `^ {0,3}${opening[0]}{${opening.length},}[ \\t]*$`
    )
    if (!closing.test(value.slice(value.lastIndexOf('\n') + 1))) {
      continue
    }
    const offset = position.end.offset + separator.length
    return {
      root,
      cached: {
        source: source.slice(0, offset),
        offset,
        line: position.end.line + 2,
        children: structuredClone(children.slice(0, index + 1)),
      },
    }
  }
  return { root, cached: null }
}

function hasDefinitions(node: MarkdownNode): boolean {
  return (
    node.type === 'definition' ||
    node.type === 'footnoteDefinition' ||
    node.children?.some(hasDefinitions) === true
  )
}

function shiftPositions(node: MarkdownNode, offset: number, lines: number) {
  if (node.position !== undefined) {
    for (const point of [node.position.start, node.position.end]) {
      if (point.offset !== undefined) {
        point.offset += offset
      }
      point.line += lines
    }
  }
  node.children?.forEach((child) => shiftPositions(child, offset, lines))
}
