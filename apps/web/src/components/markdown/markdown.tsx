import {
  CheckIcon,
  CopyIcon,
  GithubIcon,
  GlobeIcon,
  InfoIcon,
  LightbulbIcon,
  MessageSquareWarningIcon,
  OctagonAlertIcon,
  TextWrapIcon,
  TriangleAlertIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { memo, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import {
  FileTypeIcon,
  hasLanguageIcon,
  languageFileName,
} from '@/components/file-icon'
import { Highlight } from '@/components/markdown/highlight'
import {
  MarkdownDetails,
  MarkdownTable,
} from '@/components/markdown/markdown-blocks'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useCopy } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

type MarkdownNode = {
  type?: string
  value?: unknown
  data?: { hProperties?: Record<string, unknown> }
  children?: MarkdownNode[]
}

const alerts = {
  note: {
    label: 'Note',
    icon: InfoIcon,
    border: 'border-blue-500/70',
    title: 'text-blue-600 dark:text-blue-400',
  },
  tip: {
    label: 'Tip',
    icon: LightbulbIcon,
    border: 'border-emerald-500/70',
    title: 'text-emerald-600 dark:text-emerald-400',
  },
  important: {
    label: 'Important',
    icon: MessageSquareWarningIcon,
    border: 'border-purple-500/70',
    title: 'text-purple-600 dark:text-purple-400',
  },
  warning: {
    label: 'Warning',
    icon: TriangleAlertIcon,
    border: 'border-amber-500/70',
    title: 'text-amber-600 dark:text-amber-500',
  },
  caution: {
    label: 'Caution',
    icon: OctagonAlertIcon,
    border: 'border-red-500/70',
    title: 'text-red-600 dark:text-red-400',
  },
}

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    blockquote: [...(defaultSchema.attributes?.blockquote ?? []), 'dataAlert'],
  },
}

const failedHosts = new Set<string>()

function remarkGithubAlerts() {
  return (tree: MarkdownNode) => {
    function visit(node: MarkdownNode) {
      node.children?.forEach(visit)
      readAlert(node)
    }
    visit(tree)
  }
}

function readAlert(node: MarkdownNode) {
  if (node.type !== 'blockquote') {return}
  const paragraph = node.children?.[0]
  const text = paragraph?.children?.[0]
  if (
    paragraph?.type !== 'paragraph' ||
    text?.type !== 'text' ||
    typeof text.value !== 'string'
  )
    {return}
  const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:\r?\n|$)/i.exec(
    text.value
  )
  if (match === null) {return}
  const remainder = text.value.slice(match[0].length)
  if (remainder.length > 0) {text.value = remainder}
  else if (match[0].endsWith('\n') || paragraph.children?.length === 1) {
    paragraph.children?.shift()
    if (paragraph.children?.length === 0) {node.children?.shift()}
  } else {return}
  node.data = {
    ...node.data,
    hProperties: {
      ...node.data?.hProperties,
      dataAlert: match[1].toLowerCase(),
    },
  }
}

const components: Components = {
  blockquote({ node, children }) {
    const kind = node?.properties.dataAlert
    const alert =
      kind === 'note' ||
      kind === 'tip' ||
      kind === 'important' ||
      kind === 'warning' ||
      kind === 'caution'
        ? alerts[kind]
        : null
    if (alert === null) {return <blockquote>{children}</blockquote>}
    return (
      <div role="note" className={cn('my-1 border-l-2 pl-3', alert.border)}>
        <p className={cn('flex items-center gap-1.5 font-medium', alert.title)}>
          <HugeiconsIcon
            icon={alert.icon}
            aria-hidden
            className="size-3.5 shrink-0"
          />
          {alert.label}
        </p>
        {children}
      </div>
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
          if (element !== null && width > 1)
            {element.style.setProperty('--list-gutter', `${width + 2}ch`)}
        }}
      >
        {children}
      </ol>
    )
  },
  a({ node, href, children }) {
    const host = externalHost(href)
    if (host === null) {return <a href={href}>{children}</a>}
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
    return (
      <img
        src={typeof src === 'string' ? src : undefined}
        alt={alt ?? ''}
        className="border-border/40 h-auto max-h-[30rem] w-auto max-w-[min(100%,30rem)] rounded-lg border object-contain"
      />
    )
  },
  pre({ node, children }) {
    const code = node?.children[0]
    if (code?.type !== 'element' || code.tagName !== 'code')
      {return <pre>{children}</pre>}
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
  return (
    <div
      className={cn(
        'chat-markdown text-foreground w-full min-w-0 text-sm leading-relaxed [overflow-wrap:anywhere] [word-break:break-word]',
        props.className
      )}
      data-streaming={props.streaming === true ? '' : undefined}
    >
      <ReactMarkdown
        remarkPlugins={
          props.lineBreaks === true
            ? [remarkGfm, remarkGithubAlerts, remarkBreaks]
            : [remarkGfm, remarkGithubAlerts]
        }
        rehypePlugins={
          props.rawHtml === false ? [] : [rehypeRaw, [rehypeSanitize, schema]]
        }
        components={components}
      >
        {props.text}
      </ReactMarkdown>
    </div>
  )
}

function externalHost(href: string | undefined) {
  if (href === undefined || !/^https?:\/\//i.test(href)) {return null}
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

function CodeBlock(props: { code: string; language: string }) {
  const [wrap, setWrap] = useState(true)
  const clipboard = useCopy()
  const wrapLabel = wrap ? 'Disable line wrap' : 'Wrap lines'
  const copyLabel = clipboard.copied ? 'Copied' : 'Copy code'
  return (
    <div
      className="chat-markdown-codeblock border-border/70 bg-secondary dark:bg-input/32 my-[0.65rem] overflow-hidden rounded-lg border leading-snug dark:border-transparent"
      data-language={props.language}
      data-wrap={wrap}
    >
      <div className="chat-markdown-codeblock-header flex items-center justify-between gap-2 pt-1.5 pr-1.5 pb-0 pl-3 select-none">
        <span className="text-2xs inline-flex min-w-0 items-center gap-1.5 font-mono">
          {hasLanguageIcon(props.language) ? (
            <Tooltip label={props.language}>
              <span
                className="inline-flex shrink-0 rounded-sm"
                aria-label={`Language: ${props.language}`}
              >
                <FileTypeIcon
                  path={languageFileName(props.language)}
                  className="size-3.5"
                />
              </span>
            </Tooltip>
          ) : (
            <span className="truncate">{props.language}</span>
          )}
        </span>
        <span className="flex items-center gap-0.5" role="toolbar">
          <Tooltip label={wrapLabel}>
            <Button
              type="button"
              variant={wrap ? 'secondary' : 'ghost-muted'}
              size="icon-xs"
              aria-pressed={wrap}
              aria-label={wrapLabel}
              onClick={() => setWrap(!wrap)}
            >
              <HugeiconsIcon icon={TextWrapIcon} className="size-3" />
            </Button>
          </Tooltip>
          <Tooltip label={copyLabel}>
            <Button
              type="button"
              variant="ghost-muted"
              size="icon-xs"
              aria-label={copyLabel}
              onClick={() => void clipboard.copy(props.code)}
            >
              <HugeiconsIcon
                icon={clipboard.copied ? CheckIcon : CopyIcon}
                className="size-3"
              />
            </Button>
          </Tooltip>
        </span>
      </div>
      <Highlight code={props.code} language={props.language} />
    </div>
  )
}
