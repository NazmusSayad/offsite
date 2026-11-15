import type { FilePreview } from '@offsite/core/projects'
import { useMemo } from 'react'
import type { Components } from 'react-markdown'
import { bundledLanguagesInfo } from 'shiki/langs'
import { Highlight } from '@/components/markdown/highlight'
import { Markdown } from '@/components/markdown/markdown'
import { useMermaid } from '@/components/markdown/mermaid'
import { headingFor, isExternal } from '@/features/files/markdown-preview'
import { mediaKind } from '@/lib/media'
import { openBrowser } from '@/lib/url'

export function FileView(props: {
  target: string
  base: string
  text: string
  image: string | null
  raw: boolean
}) {
  const extension = extensionOf(props.target)
  if (props.raw) {
    return (
      <pre className="p-4 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
        {props.text}
      </pre>
    )
  }
  if (props.image !== null) {
    return (
      <div className="grid min-h-full place-items-center p-4">
        <img src={props.image} alt="" className="max-w-full" />
      </div>
    )
  }
  if (['md', 'markdown', 'mdx'].includes(extension)) {
    return (
      <MarkdownFile target={props.target} base={props.base} text={props.text} />
    )
  }
  if (extension === 'mmd' || extension === 'mermaid') {
    return <MermaidFile text={props.text} />
  }
  if (extension === 'json') {
    return <CodeFile code={formatJson(props.text)} language="json" />
  }
  return <CodeFile code={props.text} language={languageOf(props.target)} />
}

export function canView(target: string) {
  const extension = extensionOf(target)
  return (
    /^(\/|[a-z]:[\\/])/i.test(target) &&
    !['html', 'htm', 'xhtml', 'pdf'].includes(extension) &&
    (extension === 'svg' || mediaKind(target) === null)
  )
}

export function fileContent(preview: FilePreview) {
  if (preview.kind === 'text') {
    return { text: preview.content, image: null }
  }
  if (preview.kind === 'image') {
    return {
      text: new TextDecoder().decode(
        Uint8Array.from(atob(preview.data), (character) =>
          character.charCodeAt(0)
        )
      ),
      image: `data:${preview.mediaType};base64,${preview.data}`,
    }
  }
  return null
}

export function browsePath(file: string) {
  const encoded = file
    .replaceAll('\\', '/')
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  return encoded.startsWith('/') ? encoded : `/${encoded}`
}

function MarkdownFile(props: { target: string; base: string; text: string }) {
  const target = props.target
  const base = props.base
  const components = useMemo<Components>(
    () => ({
      img(image) {
        const src = image.src ?? ''
        return (
          <img
            src={
              isExternal(src)
                ? src
                : `${base}${browsePath(resolvePath(target, src))}`
            }
            alt={image.alt}
            width={image.width}
            height={image.height}
            className="max-w-full"
          />
        )
      },
    }),
    [target, base]
  )

  return (
    <div
      className="mx-auto max-w-3xl p-6"
      onClickCapture={(event) => {
        const anchor =
          event.target instanceof Element ? event.target.closest('a') : null
        const href = anchor?.getAttribute('href') ?? null
        if (href === null || isExternal(href)) {
          return
        }
        event.preventDefault()
        event.stopPropagation()
        if (href.startsWith('#')) {
          headingFor(event.currentTarget, href.slice(1))?.scrollIntoView()
          return
        }
        openBrowser(resolvePath(target, href))
      }}
    >
      <Markdown
        text={props.text.replace(/^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/, '')}
        components={components}
      />
    </div>
  )
}

function MermaidFile(props: { text: string }) {
  const svg = useMermaid(props.text)
  if (svg === null) {
    return <CodeFile code={props.text} language="mermaid" />
  }
  return (
    <div
      className="flex justify-center p-4 [&>svg]:h-auto [&>svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

function CodeFile(props: { code: string; language: string }) {
  return (
    <div className="p-4 font-mono text-xs leading-relaxed [&_pre]:[overflow-wrap:anywhere] [&_pre]:whitespace-pre-wrap">
      <Highlight code={props.code} language={props.language} />
    </div>
  )
}

function extensionOf(target: string) {
  return /\.([^./\\]+)$/.exec(target)?.[1].toLowerCase() ?? ''
}

function languageOf(target: string) {
  const extension = extensionOf(target)
  const key =
    extension === ''
      ? target.slice(target.search(/[^/\\]*$/)).toLowerCase()
      : extension
  return (
    bundledLanguagesInfo.find(
      (language) => language.id === key || language.aliases?.includes(key)
    )?.id ?? 'text'
  )
}

function formatJson(text: string) {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return text
  }
  const compact = text.replaceAll(
    /("(?:\\.|[^"\\])*")|\s+/g,
    (_match, quoted: string | undefined) => quoted ?? ''
  )
  return JSON.stringify(parsed) === compact
    ? JSON.stringify(parsed, null, 2)
    : text
}

function resolvePath(target: string, href: string) {
  const pathname = new URL(href, `file://${browsePath(target)}`).pathname
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    decoded = pathname
  }
  return decoded.replace(/^\/(?=[a-z]:\/)/i, '')
}
