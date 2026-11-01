import {
  type DefaultTreeAdapterTypes,
  defaultTreeAdapter,
  html,
  parse,
  serialize,
} from 'parse5'
import { rewriteCss } from './css.ts'
import { rewriteHandler, rewriteScript } from './script.ts'
import { linkRewriter } from './sites.ts'

type Element = DefaultTreeAdapterTypes.Element
type Parent = DefaultTreeAdapterTypes.ParentNode

type Page = { key: string; base: URL; rewrite: (url: string) => string }

const LINKS = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'data',
  'background',
])
const LINK_TAGS = new Set([
  'a',
  'area',
  'audio',
  'base',
  'body',
  'button',
  'embed',
  'form',
  'iframe',
  'img',
  'input',
  'link',
  'object',
  'script',
  'source',
  'td',
  'track',
  'video',
])
const REMOVED = new Set(['integrity', 'crossorigin', 'nonce', 'ping'])
const NAVIGATING = new Set(['a', 'area', 'base', 'form'])
const SCRIPT_TYPES = new Set([
  '',
  'module',
  'text/javascript',
  'application/javascript',
  'text/ecmascript',
  'application/ecmascript',
])
const META_REMOVED = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
])

export function rewriteHtml(
  source: string,
  key: string,
  base: URL,
  script: string
) {
  const document = parse(source)
  const page = { key, base, rewrite: linkRewriter(key, base) }
  rewriteChildren(document, page)
  const head = findHead(document)
  const runtime = defaultTreeAdapter.createElement('script', html.NS.HTML, [])
  defaultTreeAdapter.insertText(runtime, script)
  const first = head.childNodes[0]
  if (first === undefined) {
    defaultTreeAdapter.appendChild(head, runtime)
  } else {
    defaultTreeAdapter.insertBefore(head, runtime, first)
  }
  return serialize(document)
}

function findHead(node: Parent): Element {
  for (const child of node.childNodes) {
    if ('tagName' in child) {
      if (child.tagName === 'head') {
        return child
      }
      if (child.tagName === 'html') {
        return findHead(child)
      }
    }
  }
  throw new Error('the page has no head')
}

function rewriteChildren(node: Parent, page: Page) {
  const remove: DefaultTreeAdapterTypes.ChildNode[] = []
  for (const child of node.childNodes) {
    if (!('tagName' in child)) {
      continue
    }
    if (rewriteElement(child, page)) {
      remove.push(child)
      continue
    }
    rewriteChildren(child, page)
    if ('content' in child) {
      rewriteChildren(child.content, page)
    }
  }
  for (const child of remove) {
    defaultTreeAdapter.detachNode(child)
  }
}

function rewriteElement(element: Element, page: Page) {
  const tag = element.tagName
  if (tag === 'meta') {
    const equiv = attribute(element, 'http-equiv')?.value.toLowerCase()
    if (equiv !== undefined && META_REMOVED.has(equiv)) {
      return true
    }
    if (attribute(element, 'name')?.value.toLowerCase() === 'referrer') {
      return true
    }
    if (equiv === 'refresh') {
      rewriteRefresh(element, page)
    }
  }
  if (tag === 'base') {
    const href = attribute(element, 'href')?.value
    const next = href === undefined ? null : URL.parse(href, page.base)
    if (next !== null) {
      page.base = next
      page.rewrite = linkRewriter(page.key, next)
    }
  }
  element.attrs = element.attrs.filter((item) => !REMOVED.has(item.name))
  if (NAVIGATING.has(tag)) {
    element.attrs = element.attrs.filter(
      (item) =>
        item.name !== 'target' ||
        !/^_(top|parent|blank)$/i.test(item.value.trim())
    )
  }
  for (const item of element.attrs) {
    if (LINKS.has(item.name) && LINK_TAGS.has(tag)) {
      item.value = page.rewrite(item.value)
    } else if (item.name === 'srcset' || item.name === 'imagesrcset') {
      item.value = rewriteSrcset(item.value, page.rewrite)
    } else if (item.name === 'style') {
      item.value = rewriteCss(item.value, page.rewrite)
    } else if (item.name.startsWith('on')) {
      item.value = rewriteHandler(item.value, page.rewrite)
    }
  }
  if (tag === 'style') {
    rewriteText(element, (text) => rewriteCss(text, page.rewrite))
  }
  if (tag === 'script') {
    rewriteInlineScript(element, page)
  }
  return false
}

function rewriteInlineScript(element: Element, page: Page) {
  const type = (attribute(element, 'type')?.value ?? '').trim().toLowerCase()
  if (type === 'importmap') {
    rewriteText(element, (text) =>
      JSON.stringify(rewriteMapLinks(JSON.parse(text), page))
    )
    return
  }
  if (SCRIPT_TYPES.has(type)) {
    rewriteText(element, (text) =>
      rewriteScript(text, page.rewrite, `${page.key} ${page.base.origin}`)
    )
  }
}

function rewriteMapLinks(value: unknown, page: Page): unknown {
  if (typeof value === 'string') {
    return page.rewrite(value)
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }
  return Object.fromEntries(
    Object.entries(value).map((entry) => [
      entry[0],
      rewriteMapLinks(entry[1], page),
    ])
  )
}

function rewriteText(element: Element, rewrite: (text: string) => string) {
  for (const child of element.childNodes) {
    if ('value' in child) {
      child.value = rewrite(child.value)
    }
  }
}

function rewriteRefresh(element: Element, page: Page) {
  const content = attribute(element, 'content')
  if (content === undefined) {
    return
  }
  content.value = content.value.replace(
    /(url\s*=\s*['"]?)([^'"]+)/i,
    (_match, label: string, url: string) => `${label}${page.rewrite(url)}`
  )
}

function rewriteSrcset(value: string, rewrite: (url: string) => string) {
  return value
    .split(/,\s+/)
    .map((candidate) => {
      const parts = candidate.trim().split(/\s+/)
      const url = parts[0]
      if (url === undefined || url === '') {
        return candidate
      }
      return [rewrite(url), ...parts.slice(1)].join(' ')
    })
    .join(', ')
}

function attribute(element: Element, name: string) {
  return element.attrs.find((item) => item.name === name)
}
