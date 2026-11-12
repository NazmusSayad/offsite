type MarkdownNode = {
  type: string
  value?: string
  children?: MarkdownNode[]
}

const voidTags = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

export function remarkUnclosedHtml() {
  return (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      if (node.children === undefined) {
        return
      }
      const children = node.children
      children.forEach((child, index) => {
        visit(child)
        if (child.type !== 'html') {
          return
        }
        const tag = /^<([a-z][\w-]*)\b[^>]*?(\/?)>$/i.exec(child.value ?? '')
        if (
          tag === null ||
          tag[2] === '/' ||
          voidTags.has(tag[1].toLowerCase())
        ) {
          return
        }
        const closing = new RegExp(`^</${tag[1]}\\s*>$`, 'i')
        const closed = children
          .slice(index + 1)
          .some(
            (sibling) =>
              sibling.type === 'html' && closing.test(sibling.value ?? '')
          )
        if (!closed) {
          child.type = 'text'
        }
      })
    }
    visit(tree)
  }
}
