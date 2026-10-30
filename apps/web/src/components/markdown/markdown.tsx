import { GithubIcon, GlobeIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { memo, useState } from 'react'
import ReactMarkdown, {
  type Components,
  defaultUrlTransform,
} from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import {
  MarkdownBlockquote,
  remarkGithubAlerts,
} from '@/components/markdown/markdown-alerts'
import {
  MarkdownDetails,
  MarkdownTable,
} from '@/components/markdown/markdown-blocks'
import { CodeBlock } from '@/components/markdown/markdown-code'
import { LocalMedia, Media } from '@/components/markdown/markdown-media'
import { remarkWindowsPaths } from '@/components/markdown/markdown-paths'
import { streamingParser } from '@/components/markdown/markdown-stream'
import { mediaKind } from '@/lib/media'
import { openBrowser } from '@/lib/url'
import { cn } from '@/lib/utils'

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    blockquote: [...(defaultSchema.attributes?.blockquote ?? []), 'dataAlert'],
  },
  protocols: {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href ?? []), 'file'],
  },
}

const failedHosts = new Set<string>()

const components: Components = {
  blockquote({ node, children }) {
    return (
      <MarkdownBlockquote kind={node?.properties.dataAlert}>
        {children}
      </MarkdownBlockquote>
    )
  },
  ol({ node, start, children }) {
    const count =
      node?.children.filter(
        (child) => child.type === 'element' && child.tagName === 'li'
      ).length ?? 0
    const first = start ?? 1
    const width = Math.max(
      String(first).length,
      String(first + Math.max(count - 1, 0)).length
    )
    return (
      <ol
        start={start}
        ref={(element) => {
          if (element !== null && width > 1) {
            element.style.setProperty('--list-gutter', `${width + 2}ch`)
          }
        }}
      >
        {children}
      </ol>
    )
  },
  a({ node, href, children }) {
    const file = localFile(href)
    if (file !== null) {
      return (
        <a
          href={href}
          onClick={(event) => {
            event.preventDefault()
            openBrowser(file)
          }}
        >
          {children}
        </a>
      )
    }
    const host = externalHost(href)
    if (host === null) {
      return <a href={href}>{children}</a>
    }
    const plain = node?.children.every((child) => child.type === 'text')
      ? node.children
          .map((child) => (child.type === 'text' ? child.value : ''))
          .join('')
      : ''
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {plain === '' ? (
          children
        ) : (
          <ExternalLinkText host={host} text={plain} />
        )}
      </a>
    )
  },
  table({ children }) {
    return <MarkdownTable>{children}</MarkdownTable>
  },
  details({ open, children }) {
    return <MarkdownDetails open={open === true}>{children}</MarkdownDetails>
  },
  img({ src, alt }) {
    if (typeof src !== 'string') {
      return null
    }
    if (
      (src.startsWith('/') && !src.startsWith('//')) ||
      src.startsWith('./')
    ) {
      return (
        <LocalMedia
          path={decodeURI(src).replace(/^\/(?=[a-z]:\/)/i, '')}
          alt={alt ?? ''}
          raw={`![${alt ?? ''}](${src})`}
        />
      )
    }
    return (
      <span className={cn('block', mediaKind(src) !== 'audio' && 'w-1/2')}>
        <Media
          src={src}
          alt={alt ?? ''}
          name={src.startsWith('data:') ? 'Image' : src.split(/[?#]/)[0]}
          kind={mediaKind(src) ?? 'image'}
          raw={`![${alt ?? ''}](${src})`}
        />
      </span>
    )
  },
  pre({ node, children }) {
    const code = node?.children[0]
    if (code?.type !== 'element' || code.tagName !== 'code') {
      return <pre>{children}</pre>
    }
    const text = code.children
      .map((child) => (child.type === 'text' ? child.value : ''))
      .join('')
    const classes = code.properties.className
    const language = Array.isArray(classes)
      ? classes
          .map(String)
          .find((name) => name.startsWith('language-'))
          ?.slice('language-'.length)
      : undefined
    return (
      <CodeBlock
        code={text.replace(/\n$/, '')}
        language={language === 'gitignore' ? 'ini' : (language ?? 'text')}
      />
    )
  },
}

export const Markdown = memo(MarkdownView)

function MarkdownView(props: {
  text: string
  className?: string
  streaming?: boolean
  lineBreaks?: boolean
  rawHtml?: boolean
}) {
  const [parser] = useState(streamingParser)
  return (
    <div
      className={cn(
        'chat-markdown text-foreground w-full min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere] [word-break:break-word]',
        props.className
      )}
      data-streaming={props.streaming === true ? '' : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          remarkGithubAlerts,
          remarkWindowsPaths,
          ...(props.lineBreaks === true ? [remarkBreaks] : []),
          ...(props.streaming === true ? [parser] : []),
        ]}
        rehypePlugins={
          props.rawHtml === false ? [] : [rehypeRaw, [rehypeSanitize, schema]]
        }
        components={components}
        urlTransform={(url) =>
          url.startsWith('file:') ? url : defaultUrlTransform(url)
        }
      >
        {props.text}
      </ReactMarkdown>
    </div>
  )
}

function localFile(href: string | undefined) {
  if (
    href === undefined ||
    href === '' ||
    href.startsWith('#') ||
    href.startsWith('//')
  ) {
    return null
  }
  if (href.startsWith('file:')) {
    return href
  }
  if (!/^[a-z]:[\\/]/i.test(href) && /^[a-z][a-z0-9+.-]*:/i.test(href)) {
    return null
  }
  try {
    return decodeURI(href)
  } catch {
    return href
  }
}

function externalHost(href: string | undefined) {
  if (href === undefined || !/^https?:\/\//i.test(href)) {
    return null
  }
  try {
    return new URL(href).host
  } catch {
    return null
  }
}

function ExternalLinkText(props: { host: string; text: string }) {
  const leading =
    /^https?:\/\//i.exec(props.text)?.[0].length ??
    Math.min(props.text.length, 1)
  return (
    <>
      <span className="whitespace-nowrap">
        <LinkFavicon host={props.host} />
        {props.text.slice(0, leading)}
      </span>
      {Array.from(props.text.slice(leading), (character, index) => (
        <span key={index}>
          {character}
          <wbr />
        </span>
      ))}
    </>
  )
}

function LinkFavicon(props: { host: string }) {
  const [failed, setFailed] = useState(failedHosts.has(props.host))
  const hostname = props.host.toLowerCase()
  const github = hostname === 'github.com' || hostname.endsWith('.github.com')
  return (
    <span
      className="ms-[0.25em] me-[0.2em] inline-flex size-[14px] [vertical-align:-0.125em]"
      aria-hidden
    >
      {github ? (
        <HugeiconsIcon
          icon={GithubIcon}
          className="block size-full shrink-0 select-none"
        />
      ) : failed ? (
        <HugeiconsIcon
          icon={GlobeIcon}
          className="block size-full shrink-0 select-none"
        />
      ) : (
        <img
          src={`https://${props.host}/favicon.ico`}
          alt=""
          loading="lazy"
          draggable={false}
          className="block size-full shrink-0 rounded-sm select-none"
          onError={() => {
            failedHosts.add(props.host)
            setFailed(true)
          }}
        />
      )}
    </span>
  )
}
