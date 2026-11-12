import { skillPill } from '@/lib/skills'

type MarkdownNode = {
  type: string
  value?: string
  children?: MarkdownNode[]
  data?: { hName: string; hProperties: { className: string } }
}

export function remarkSkills(names: string[]) {
  const pattern = new RegExp(
    `(?<!\\S)(${names.map((name) => `/${name.replaceAll('.', '\\.')}`).join('|')})(?!\\S)`,
    'g'
  )
  return () => (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      if (node.children === undefined) {
        return
      }
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || child.value === undefined) {
          visit(child)
          return [child]
        }
        const parts: MarkdownNode[] = []
        let offset = 0
        for (const match of child.value.matchAll(pattern)) {
          if (match.index > offset) {
            parts.push({
              type: 'text',
              value: child.value.slice(offset, match.index),
            })
          }
          parts.push({
            type: 'skill',
            data: { hName: 'span', hProperties: { className: skillPill } },
            children: [{ type: 'text', value: match[0] }],
          })
          offset = match.index + match[0].length
        }
        if (offset === 0) {
          return [child]
        }
        if (offset < child.value.length) {
          parts.push({ type: 'text', value: child.value.slice(offset) })
        }
        return parts
      })
    }
    if (names.length > 0) {
      visit(tree)
    }
  }
}
