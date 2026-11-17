import type { Token } from 'parse5'
import { RewritingStream } from 'parse5-html-rewriting-stream'
import { rewriteCss } from './css.ts'
import { rewriteHandler, rewriteScript } from './script.ts'
import { linkRewriter } from './sites.ts'

type Tag = { tagName: string; attrs: Token.Attribute[] }

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
const REMOVED = new Set(['integrity', 'nonce', 'ping'])
const NAVIGATING = new Set(['base', 'form'])
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

export function rewriteHtml(key: string, base: URL, script: string) {
  const page = { key, base, rewrite: linkRewriter(key, base) }
  const stream = new RewritingStream()
  const runtime = `<script>${script}</script>`
  let injected = false
  let inline: { tagName: string; type: string; text: string } | null = null
  stream.on('startTag', (tag) => {
    if (!injected && tag.tagName !== 'html') {
      injected = true
      if (tag.tagName === 'head') {
        stream.emitStartTag(tag)
        stream.emitRaw(runtime)
        return
      }
      stream.emitRaw(runtime)
    }
    if (rewriteTag(tag, page)) {
      return
    }
    stream.emitStartTag(tag)
    if (tag.tagName === 'style' || tag.tagName === 'script') {
      const type = attribute(tag, 'type')?.value.trim().toLowerCase() ?? ''
      inline = { tagName: tag.tagName, type, text: '' }
    }
  })
  stream.on('text', (_text, raw) => {
    if (inline === null) {
      stream.emitRaw(raw)
      return
    }
    inline.text += raw
  })
  stream.on('endTag', (tag, raw) => {
    if (inline !== null && inline.tagName === tag.tagName) {
      stream.emitRaw(rewriteInline(inline, page))
      inline = null
    }
    stream.emitRaw(raw)
  })
  return stream
}

function rewriteTag(tag: Tag, page: Page) {
  const name = tag.tagName
  if (name === 'meta') {
    const equiv = attribute(tag, 'http-equiv')?.value.toLowerCase()
    if (equiv !== undefined && META_REMOVED.has(equiv)) {
      return true
    }
    if (attribute(tag, 'name')?.value.toLowerCase() === 'referrer') {
      return true
    }
    if (equiv === 'refresh') {
      rewriteRefresh(tag, page)
    }
  }
  if (name === 'base') {
    const href = attribute(tag, 'href')?.value
    const next = href === undefined ? null : URL.parse(href, page.base)
    if (next !== null) {
      page.base = next
      page.rewrite = linkRewriter(page.key, next)
    }
  }
  tag.attrs = tag.attrs.filter((item) => !REMOVED.has(item.name))
  if (NAVIGATING.has(name)) {
    tag.attrs = tag.attrs.filter(
      (item) =>
        item.name !== 'target' ||
        !/^_(top|parent|blank)$/i.test(item.value.trim())
    )
  }
  for (const item of tag.attrs) {
    if (LINKS.has(item.name) && LINK_TAGS.has(name)) {
      item.value = page.rewrite(item.value)
    } else if (item.name === 'srcset' || item.name === 'imagesrcset') {
      item.value = rewriteSrcset(item.value, page.rewrite)
    } else if (item.name === 'style') {
      item.value = rewriteCss(item.value, page.rewrite)
    } else if (item.name.startsWith('on')) {
      item.value = rewriteHandler(item.value, page.rewrite)
    }
  }
  return false
}

function rewriteInline(
  inline: { tagName: string; type: string; text: string },
  page: Page
) {
  if (inline.tagName === 'style') {
    return rewriteCss(inline.text, page.rewrite)
  }
  if (inline.type === 'importmap') {
    return JSON.stringify(rewriteMapLinks(JSON.parse(inline.text), page))
  }
  if (SCRIPT_TYPES.has(inline.type)) {
    return rewriteScript(
      inline.text,
      page.rewrite,
      `${page.key} ${page.base.origin}`
    )
  }
  return inline.text
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

function rewriteRefresh(tag: Tag, page: Page) {
  const content = attribute(tag, 'content')
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

function attribute(tag: Tag, name: string) {
  return tag.attrs.find((item) => item.name === name)
}
