import { cn } from '@/lib/utils'
import {
  text,
  type ToolResult,
  type ToolUse,
  type WorkEntry,
} from '@/transcript/tool-details'
import {
  FileChanges,
  isFileChange,
  ReasoningPart,
  ToolPart,
  toolTitle,
} from '@/transcript/tool-parts'
import { Disclosure, Shimmer, ToolRow } from '@/transcript/tool-row'

type Item =
  | { kind: 'thinking'; key: string; text: string; last: boolean }
  | { kind: 'tool'; key: string; tool: ToolUse }
  | { kind: 'reads'; key: string; tools: ToolUse[] }
  | { kind: 'files'; key: string; tools: ToolUse[] }

const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

export function ContextGroup(props: {
  entries: WorkEntry[]
  results: Map<string, ToolResult>
  cwd: string
  live: boolean
  open: boolean
  onToggle: () => void
}) {
  const tools = props.entries.flatMap((entry) =>
    entry.kind === 'tool' ? [entry.tool] : []
  )
  const thoughts = props.entries.length - tools.length
  const names = list.format([...new Set(tools.map(toolTitle))])
  const title = names !== '' ? names : thoughts === 1 ? 'Thought' : 'Thoughts'
  const count = tools.length > 0 ? tools.length : thoughts
  return (
    <div className="flex w-full min-w-0 flex-col">
      <button
        type="button"
        aria-expanded={props.open}
        aria-label={`Used ${count} ${title}`}
        onClick={props.onToggle}
        className={cn(
          'group/tool focus-visible:ring-ring/70 flex h-7 w-full cursor-pointer items-center rounded-md text-left text-[13px] leading-4 tracking-[-0.04px] select-none focus-visible:ring-2 focus-visible:outline-none',
          props.open && 'bg-background sticky top-0 z-20 box-content pb-2'
        )}
      >
        <span className="flex max-w-[calc(100%-24px)] min-w-0 items-center gap-1">
          <span className="text-muted-foreground shrink-0">Used</span>
          <span className="text-foreground shrink-0 tabular-nums">{count}</span>
          <span className="text-foreground min-w-0 truncate font-medium">
            {title}
          </span>
        </span>
        <Disclosure open={props.open} />
      </button>
      {props.open && (
        <div className="flex flex-col gap-2">
          {items(props.entries, props.results).map((item) => (
            <div
              key={item.key}
              className="flex min-h-7 min-w-0 flex-col justify-center"
            >
              <GroupItem
                item={item}
                results={props.results}
                cwd={props.cwd}
                live={props.live}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupItem(props: {
  item: Item
  results: Map<string, ToolResult>
  cwd: string
  live: boolean
}) {
  const item = props.item
  switch (item.kind) {
    case 'thinking':
      return (
        <ReasoningPart text={item.text} streaming={props.live && item.last} />
      )
    case 'tool':
      return (
        <ToolPart
          tool={item.tool}
          result={props.results.get(item.tool.id)}
          cwd={props.cwd}
          live={props.live}
        />
      )
    case 'reads':
      return (
        <ToolRow
          title="Read"
          subtitle={
            <span
              title={item.tools
                .map((tool) => text(tool.input.file_path))
                .join('\n')}
            >
              {item.tools.map((tool, index) => (
                <span key={tool.id}>
                  {index > 0 && ' '}
                  <Shimmer
                    text={text(tool.input.file_path).split('/').at(-1) ?? ''}
                    active={
                      props.live && props.results.get(tool.id) === undefined
                    }
                  />
                </span>
              ))}
            </span>
          }
          pending={
            props.live &&
            item.tools.some((tool) => props.results.get(tool.id) === undefined)
          }
          grouped
          open={false}
          onToggle={null}
        />
      )
    case 'files':
      return (
        <FileChanges
          tools={item.tools}
          results={props.results}
          cwd={props.cwd}
          live={props.live}
        />
      )
  }
}

function items(entries: WorkEntry[], results: Map<string, ToolResult>) {
  const grouped: Item[] = []
  entries.forEach((entry, index) => {
    if (entry.kind === 'thinking') {
      grouped.push({
        kind: 'thinking',
        key: entry.key,
        text: entry.text,
        last: index === entries.length - 1,
      })
      return
    }
    const failed = results.get(entry.tool.id)?.isError === true
    const kind =
      failed || !(entry.tool.name === 'Read' || isFileChange(entry.tool))
        ? null
        : entry.tool.name === 'Read'
          ? 'reads'
          : 'files'
    const previous = grouped.at(-1)
    if (kind === null) {
      grouped.push({ kind: 'tool', key: entry.key, tool: entry.tool })
      return
    }
    if (previous?.kind === kind) {
      previous.tools.push(entry.tool)
      return
    }
    grouped.push({ kind, key: entry.key, tools: [entry.tool] })
  })
  return grouped
}
