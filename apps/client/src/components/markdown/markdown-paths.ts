type MarkdownNode = {
  type?: string
  url?: string
  children?: MarkdownNode[]
}

export function remarkWindowsPaths() {
  return (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      node.children?.forEach(visit)
      if (node.type !== 'image' || node.url === undefined) {
        return
      }
      if (/^[a-z]:[\\/]/i.test(node.url)) {
        node.url = `/${node.url.replaceAll('\\', '/')}`
      }
      if (node.url.startsWith('.\\')) {
        node.url = node.url.replaceAll('\\', '/')
      }
    }
    visit(tree)
  }
}
