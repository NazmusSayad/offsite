import { AlertDiamondIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { FileTypeIcon } from '@/components/file-icon'
import { Markdown } from '@/markdown/markdown'
import { DiffStatLabel } from '@/transcript/changed-files'
import {
  editStats,
  type FileChangeItem,
  readPath,
  relative,
  text,
  ToolDetails,
  toolKind,
  type WorkItem,
} from '@/transcript/tool-details'
import { Disclosure, Shimmer, ToolRow } from '@/transcript/tool-row'
import { MessageCopyButton } from '@/transcript/user-message'

export type ToolItem = Exclude<WorkItem, { kind: 'reasoning' }>

export function toolTitle(item: ToolItem) {
  switch (item.kind) {
    case 'command':
      return 'Shell'
    case 'file_change':
      return 'Edit'
    case 'web_search':
      return item.url === null ? 'Web Search' : 'Webfetch'
    case 'skill':
      return 'Skill'
    case 'tool':
      return item.name
  }
}

export function ToolPart(props: {
  item: ToolItem
  cwd: string
  live: boolean
}) {
  const item = props.item
  const pending = props.live && item.status === 'running'
  if (item.status === 'failed')
    return (
      <ErrorCard
        title={toolTitle(item)}
        subtitle={subtitleOf(item, props.cwd)}
        error={item.output}
      />
    )
  switch (item.kind) {
    case 'command':
      return (
        <ShellTool
          command={item.command}
          output={item.output}
          pending={pending}
        />
      )
    case 'file_change':
      return <FileChanges items={[item]} cwd={props.cwd} live={props.live} />
    case 'web_search': {
      const url = item.url
      if (url === null)
        return (
          <WebSearchTool
            query={item.query ?? ''}
            links={item.results}
            pending={pending}
          />
        )
      return (
        <ToolRow
          title="Webfetch"
          subtitle={
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline hover:underline-offset-2"
            >
              {url}
            </a>
          }
          pending={pending}
          grouped
          open={false}
          onToggle={null}
        />
      )
    }
    case 'skill':
      return (
        <div className="flex min-h-7 items-center gap-1 text-[13px] leading-4 tracking-[-0.04px]">
          <span className="text-muted-foreground">Loaded</span>
          <span className="text-foreground">
            <Shimmer text={item.skill} active={pending} />
          </span>
          <span className="text-muted-foreground">skill</span>
        </div>
      )
    case 'tool': {
      const input = item.input
      switch (toolKind(item.name)) {
        case 'read':
          return (
            <ToolRow
              title="Read"
              subtitle={fileName(readPath(input))}
              args={args(input, ['offset', 'limit'])}
              pending={pending}
              grouped
              open={false}
              onToggle={null}
            />
          )
        case 'search':
          return (
            <ToolRow
              title={item.name}
              subtitle={subtitleOf(item, props.cwd)}
              args={[
                ...args(input, ['pattern']),
                ...(text(input.glob) === ''
                  ? []
                  : [`include=${text(input.glob)}`]),
              ]}
              pending={pending}
              grouped
              open={false}
              onToggle={null}
            />
          )
        case 'other':
          return (
            <ToolRow
              title={`Called ${item.name}`}
              subtitle={subtitleOf(item, props.cwd)}
              args={args(
                input,
                Object.keys(input).filter(
                  (key) =>
                    ![
                      'description',
                      'query',
                      'url',
                      'path',
                      'pattern',
                    ].includes(key)
                )
              ).slice(0, 3)}
              pending={pending}
              grouped
              open={false}
              onToggle={null}
            />
          )
      }
    }
  }
}

function ShellTool(props: {
  command: string
  output: string
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <ToolRow
      title="Shell"
      subtitle={open ? undefined : props.command}
      pending={props.pending}
      grouped
      open={open}
      onToggle={() => setOpen(!open)}
      rail={false}
    >
      <div
        dir="ltr"
        className="group/output border-border relative w-full overflow-hidden rounded-md border"
      >
        <div className="absolute top-1 right-1 opacity-0 transition-opacity group-hover/output:opacity-100 focus-within:opacity-100">
          <MessageCopyButton text={props.command} />
        </div>
        <div className="max-h-60 [scrollbar-width:none] overflow-x-hidden overflow-y-auto">
          <pre className="m-0 font-mono text-[13px] leading-5 tracking-[-0.04px] [overflow-wrap:anywhere] whitespace-pre-wrap select-text">
            <code>
              <span className="text-foreground block p-3">{props.command}</span>
              {props.output !== '' && (
                <span className="border-border bg-muted text-muted-foreground block border-t p-3">
                  {props.output}
                </span>
              )}
            </code>
          </pre>
        </div>
      </div>
    </ToolRow>
  )
}

function WebSearchTool(props: {
  query: string
  links: { title: string; url: string }[]
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const links = props.links
  return (
    <ToolRow
      title="Web Search"
      subtitle={props.query}
      pending={props.pending}
      grouped
      open={open}
      onToggle={links.length === 0 ? null : () => setOpen(!open)}
    >
      <div className="flex flex-col gap-1 text-[13px] leading-5">
        {links.slice(0, 10).map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary truncate hover:underline hover:underline-offset-2"
          >
            {link.title === '' ? link.url : link.title}
          </a>
        ))}
        {links.length > 10 && (
          <span className="text-muted-foreground">
            +{links.length - 10} more
          </span>
        )}
      </div>
    </ToolRow>
  )
}

export function ReasoningPart(props: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <ToolRow
      title={props.streaming ? 'Thinking' : 'Thought'}
      subtitle={props.streaming ? reasoningHeading(props.text) : undefined}
      pending={props.streaming}
      grouped
      open={open}
      onToggle={() => setOpen(!open)}
    >
      <Markdown
        text={props.text}
        className="text-muted-foreground text-[13px]"
        lineBreaks
      />
    </ToolRow>
  )
}

export function FileChanges(props: {
  items: FileChangeItem[]
  cwd: string
  live: boolean
}) {
  const files = new Map<string, FileChangeItem[]>()
  for (const item of props.items) {
    const file = relative(item.path, props.cwd)
    files.set(file, [...(files.get(file) ?? []), item])
  }
  return (
    <div className="border-border overflow-hidden rounded-md border">
      {[...files].map(([file, items]) => (
        <FileChange
          key={file}
          file={file}
          items={items}
          pending={
            props.live && items.some((item) => item.status === 'running')
          }
        />
      ))}
    </div>
  )
}

function FileChange(props: {
  file: string
  items: FileChangeItem[]
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const slash = props.file.lastIndexOf('/')
  let added = 0
  let removed = 0
  for (const item of props.items) {
    const stats = editStats(item)
    added += stats.added
    removed += stats.removed
  }
  return (
    <div className="border-border border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="group/tool flex h-8 w-full cursor-pointer items-center gap-2 ps-3 pe-1 text-left text-[13px] leading-4 tracking-[-0.04px] select-none"
      >
        <FileTypeIcon path={props.file} className="size-4 shrink-0" />
        <span className="flex min-w-0 flex-1 items-baseline">
          {slash >= 0 && (
            <span className="text-muted-foreground truncate">
              {props.file.slice(0, slash + 1)}
            </span>
          )}
          <span className="text-foreground shrink-0">
            <Shimmer
              text={props.file.slice(slash + 1)}
              active={props.pending}
            />
          </span>
        </span>
        <DiffStatLabel
          added={added}
          removed={removed}
          layout="inline"
          className="text-xs"
        />
        <Disclosure open={open} />
      </button>
      {open && (
        <div className="border-border flex flex-col gap-2 border-t p-2">
          {props.items.map((item) => (
            <ToolDetails key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

export function ErrorCard(props: {
  title: string
  subtitle: string
  error: string
}) {
  const [open, setOpen] = useState(false)
  const error = props.error.replace(/<\/?tool_use_error>/g, '').trim()
  const head = error.split(': ')[0].trim()
  return (
    <div className="group/error flex w-full min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-6 w-full cursor-pointer items-center text-left text-[13px] leading-4 tracking-[-0.04px] select-none"
      >
        <span className="flex max-w-[calc(100%-20px)] min-w-0 items-center gap-1.5">
          <HugeiconsIcon
            icon={AlertDiamondIcon}
            className="text-destructive size-4 shrink-0"
          />
          <span className="text-foreground shrink-0 font-medium">
            {props.title}
          </span>
          {props.subtitle !== '' && !open && (
            <span className="text-muted-foreground min-w-0 truncate">
              {props.subtitle}
            </span>
          )}
          {!open && (
            <span className="text-destructive min-w-0 truncate">
              {head === '' ? 'Failed' : head[0].toUpperCase() + head.slice(1)}
            </span>
          )}
        </span>
        <Disclosure open className="ms-1.5 size-3.5" />
      </button>
      {open && (
        <div className="relative ps-6 pe-10 select-text">
          <div className="absolute top-0 right-0 opacity-0 transition-opacity group-hover/error:opacity-100 focus-within:opacity-100">
            <MessageCopyButton text={error} />
          </div>
          <p className="text-destructive text-[13px] leading-5 tracking-[-0.04px] [overflow-wrap:anywhere] whitespace-pre-wrap">
            {error}
          </p>
        </div>
      )}
    </div>
  )
}

function subtitleOf(item: ToolItem, cwd: string) {
  switch (item.kind) {
    case 'command':
      return item.command
    case 'file_change':
      return item.path
    case 'web_search':
      return item.url ?? item.query ?? ''
    case 'skill':
      return item.skill
    case 'tool': {
      const input = item.input
      if (toolKind(item.name) === 'search') {
        const path = text(input.path)
        return path === '' || path === cwd ? '' : relative(path, cwd)
      }
      return (
        ['description', 'query', 'url', 'file_path', 'path', 'pattern']
          .map((key) => text(input[key]))
          .find((value) => value !== '') ?? ''
      )
    }
  }
}

function args(input: Record<string, unknown>, keys: string[]) {
  return keys.flatMap((key) => {
    const value = input[key]
    return typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
      ? [`${key}=${value}`]
      : []
  })
}

function fileName(path: string) {
  return path.split('/').at(-1) ?? path
}

function reasoningHeading(markdown: string) {
  const headings = [
    ...markdown.matchAll(/^\s*(?:#{1,6}[ \t]+(.+?)|\*\*([^*\n]+)\*\*)\s*$/gm),
  ]
  const last = headings.at(-1)
  return last === undefined ? undefined : (last[1] ?? last[2]).trim()
}
