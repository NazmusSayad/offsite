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

type HtmlNode = {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HtmlNode[]
}

const imageBlocks = new Set([
  'p',
  'div',
  'li',
  'td',
  'th',
  'figure',
  'center',
  'blockquote',
])

export function rehypeStandaloneImages() {
  return (tree: HtmlNode) => {
    function visit(node: HtmlNode) {
      if (
        node.type === 'root' ||
        (node.tagName !== undefined && imageBlocks.has(node.tagName))
      ) {
        const image = soleImage(node)
        if (image !== null) {
          image.properties = { ...image.properties, dataStandalone: true }
        }
      }
      node.children?.forEach(visit)
    }
    visit(tree)
  }
}

function soleImage(node: HtmlNode): HtmlNode | null {
  const children = (node.children ?? []).filter(
    (child) => !(child.type === 'text' && child.value?.trim() === '')
  )
  if (children.length !== 1) {
    return null
  }
  const only = children[0]
  if (only.tagName === 'img') {
    return only
  }
  if (only.tagName === 'strong' || only.tagName === 'em') {
    return soleImage(only)
  }
  return null
}
