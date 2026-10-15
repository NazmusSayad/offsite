import { AlertDiamondIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { FileTypeIcon } from '@/components/file-icon'
import { Markdown } from '@/markdown/markdown'
import { DiffStatLabel } from '@/transcript/changed-files'
import {
  editedFile,
  editStats,
  relative,
  resultText,
  text,
  ToolDetails,
  type ToolResult,
  type ToolUse,
} from '@/transcript/tool-details'
import { Disclosure, Shimmer, ToolRow } from '@/transcript/tool-row'
import { MessageCopyButton } from '@/transcript/user-message'

export function toolTitle(tool: ToolUse) {
  switch (tool.name) {
    case 'Bash':
      return 'Shell'
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return 'Edit'
    case 'WebFetch':
      return 'Webfetch'
    case 'WebSearch':
      return 'Web Search'
    case 'Agent':
    case 'Task':
      return 'Agent'
    default:
      return tool.name
  }
}

export function isFileChange(tool: ToolUse) {
  return (
    tool.name === 'Edit' ||
    tool.name === 'MultiEdit' ||
    tool.name === 'Write' ||
    tool.name === 'NotebookEdit'
  )
}

export function ToolPart(props: {
  tool: ToolUse
  result: ToolResult | undefined
  cwd: string
  live: boolean
}) {
  const tool = props.tool
  const input = tool.input
  const pending = props.live && props.result === undefined
  if (props.result?.isError === true)
    return (
      <ErrorCard
        title={toolTitle(tool)}
        subtitle={subtitleOf(tool, props.cwd)}
        error={resultText(props.result)}
      />
    )
  switch (tool.name) {
    case 'Bash':
      return (
        <ShellTool
          command={text(input.command)}
          output={props.result === undefined ? '' : resultText(props.result)}
          pending={pending}
        />
      )
    case 'Read':
      return (
        <ToolRow
          title="Read"
          subtitle={fileName(text(input.file_path))}
          args={args(input, ['offset', 'limit'])}
          pending={pending}
          grouped
          open={false}
          onToggle={null}
        />
      )
    case 'Grep':
    case 'Glob':
      return (
        <ToolRow
          title={tool.name}
          subtitle={subtitleOf(tool, props.cwd)}
          args={[
            ...args(input, ['pattern']),
            ...(text(input.glob) === '' ? [] : [`include=${text(input.glob)}`]),
          ]}
          pending={pending}
          grouped
          open={false}
          onToggle={null}
        />
      )
    case 'WebFetch':
      return (
        <ToolRow
          title="Webfetch"
          subtitle={
            <a
              href={text(input.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline hover:underline-offset-2"
            >
              {text(input.url)}
            </a>
          }
          pending={pending}
          grouped
          open={false}
          onToggle={null}
        />
      )
    case 'WebSearch':
      return (
        <WebSearchTool
          query={text(input.query)}
          output={props.result === undefined ? '' : resultText(props.result)}
          pending={pending}
        />
      )
    case 'Skill':
      return (
        <div className="flex min-h-7 items-center gap-1 text-[13px] leading-4 tracking-[-0.04px]">
          <span className="text-muted-foreground">Loaded</span>
          <span className="text-foreground">
            <Shimmer text={text(input.skill)} active={pending} />
          </span>
          <span className="text-muted-foreground">skill</span>
        </div>
      )
    default:
      return (
        <ToolRow
          title={`Called ${tool.name}`}
          subtitle={subtitleOf(tool, props.cwd)}
          args={args(
            input,
            Object.keys(input).filter(
              (key) =>
                !['description', 'query', 'url', 'path', 'pattern'].includes(
                  key
                )
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
  output: string
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const links = [
    ...props.output.matchAll(/"title":"((?:[^"\\]|\\.)*)","url":"([^"]+)"/g),
  ].map((match) => ({ title: match[1], url: match[2] }))
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
  tools: ToolUse[]
  results: Map<string, ToolResult>
  cwd: string
  live: boolean
}) {
  const files = new Map<string, ToolUse[]>()
  for (const tool of props.tools) {
    const file = relative(editedFile(tool), props.cwd)
    files.set(file, [...(files.get(file) ?? []), tool])
  }
  return (
    <div className="border-border overflow-hidden rounded-md border">
      {[...files].map(([file, tools]) => (
        <FileChange
          key={file}
          file={file}
          tools={tools}
          pending={
            props.live &&
            tools.some((tool) => props.results.get(tool.id) === undefined)
          }
        />
      ))}
    </div>
  )
}

function FileChange(props: {
  file: string
  tools: ToolUse[]
  pending: boolean
}) {
  const [open, setOpen] = useState(false)
  const slash = props.file.lastIndexOf('/')
  let added = 0
  let removed = 0
  for (const tool of props.tools) {
    const stats = editStats(tool)
    added += stats?.added ?? 0
    removed += stats?.removed ?? 0
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
          {props.tools.map((tool) => (
            <ToolDetails key={tool.id} tool={tool} />
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

function subtitleOf(tool: ToolUse, cwd: string) {
  const input = tool.input
  switch (tool.name) {
    case 'Bash':
      return text(input.command)
    case 'Grep':
    case 'Glob': {
      const path = text(input.path)
      return path === '' || path === cwd ? '' : relative(path, cwd)
    }
    default:
      return (
        ['description', 'query', 'url', 'file_path', 'path', 'pattern']
          .map((key) => text(input[key]))
          .find((value) => value !== '') ?? ''
      )
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
