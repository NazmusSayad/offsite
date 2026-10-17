import {
  type FileChangeItem,
  readPath,
  toolKind,
  type WorkItem,
} from '@/features/transcript/tool-details'
import {
  FileChanges,
  ReasoningPart,
  type ToolItem,
  ToolPart,
  toolTitle,
} from '@/features/transcript/tool-parts'
import { Disclosure, Shimmer, ToolRow } from '@/features/transcript/tool-row'
import { cn } from '@/lib/utils'

type Item =
  | { kind: 'thinking'; key: string; text: string; last: boolean }
  | { kind: 'tool'; key: string; item: ToolItem }
  | { kind: 'reads'; key: string; items: Extract<ToolItem, { kind: 'tool' }>[] }
  | { kind: 'files'; key: string; items: FileChangeItem[] }

const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

export function ContextGroup(props: {
  entries: WorkItem[]
  cwd: string
  live: boolean
  open: boolean
  onToggle: () => void
}) {
  const tools = props.entries.flatMap((entry) =>
    entry.kind === 'reasoning' ? [] : [entry]
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
          'group/tool focus-visible:ring-ring/70 flex h-7 w-full cursor-pointer items-center rounded-md text-left text-xs select-none focus-visible:ring-2 focus-visible:outline-none',
          props.open && 'bg-background sticky top-0 z-20 box-content pb-2'
        )}
      >
        <span className="flex max-w-[calc(100%-24px)] min-w-0 items-center gap-1">
          <span className="text-muted-foreground shrink-0">Used</span>
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {count}
          </span>
          <span className="text-muted-foreground min-w-0 truncate">
            {title}
          </span>
        </span>
        <Disclosure open={props.open} />
      </button>
      {props.open && (
        <div className="flex flex-col gap-2">
          {items(props.entries).map((item) => (
            <div
              key={item.key}
              className="flex min-h-7 min-w-0 flex-col justify-center"
            >
              <GroupItem item={item} cwd={props.cwd} live={props.live} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupItem(props: { item: Item; cwd: string; live: boolean }) {
  const item = props.item
  switch (item.kind) {
    case 'thinking':
      return (
        <ReasoningPart text={item.text} streaming={props.live && item.last} />
      )
    case 'tool':
      return <ToolPart item={item.item} cwd={props.cwd} live={props.live} />
    case 'reads':
      return (
        <ToolRow
          title="Read"
          subtitle={
            <span
              title={item.items.map((read) => readPath(read.input)).join('\n')}
            >
              {item.items.map((read, index) => (
                <span key={read.id}>
                  {index > 0 && ' '}
                  <Shimmer
                    text={readPath(read.input).split('/').at(-1) ?? ''}
                    active={props.live && read.status === 'running'}
                  />
                </span>
              ))}
            </span>
          }
          pending={
            props.live && item.items.some((read) => read.status === 'running')
          }
          grouped
          open={false}
          onToggle={null}
        />
      )
    case 'files':
      return (
        <FileChanges items={item.items} cwd={props.cwd} live={props.live} />
      )
  }
}

function items(entries: WorkItem[]) {
  const grouped: Item[] = []
  entries.forEach((entry, index) => {
    if (entry.kind === 'reasoning') {
      grouped.push({
        kind: 'thinking',
        key: entry.id,
        text: entry.text,
        last: index === entries.length - 1,
      })
      return
    }
    const previous = grouped.at(-1)
    if (entry.status !== 'failed' && entry.kind === 'file_change') {
      if (previous?.kind === 'files') {
        previous.items.push(entry)
      } else {
        grouped.push({ kind: 'files', key: entry.id, items: [entry] })
      }
      return
    }
    if (
      entry.status !== 'failed' &&
      entry.kind === 'tool' &&
      toolKind(entry.name) === 'read'
    ) {
      if (previous?.kind === 'reads') {
        previous.items.push(entry)
      } else {
        grouped.push({ kind: 'reads', key: entry.id, items: [entry] })
      }
      return
    }
    grouped.push({ kind: 'tool', key: entry.id, item: entry })
  })
  return grouped
}
