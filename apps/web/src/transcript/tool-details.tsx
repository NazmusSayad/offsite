import type { Item } from '@server/protocol'
import { diffLines } from 'diff'
import { cn } from '@/lib/utils'
import { Markdown } from '@/markdown/markdown'

export type WorkItem = Extract<
  Item,
  {
    kind:
      | 'reasoning'
      | 'command'
      | 'file_change'
      | 'web_search'
      | 'skill'
      | 'tool'
  }
>

export type FileChangeItem = Extract<Item, { kind: 'file_change' }>

export function ToolDetails(props: { item: Item }) {
  const item = props.item
  switch (item.kind) {
    case 'command':
      return <Code text={`$ ${item.command}`} />
    case 'file_change':
      return (
        <div className="flex flex-col gap-2">
          {item.diffs.map((diff, index) => (
            <Diff key={index} before={diff.before} after={diff.after} />
          ))}
        </div>
      )
    case 'todo_list':
      return (
        <ul className="flex flex-col gap-1 text-sm">
          {item.steps.map((step, index) => (
            <li
              key={index}
              className={cn(
                'text-secondary-label',
                step.status === 'completed' &&
                  'text-muted-foreground line-through',
                step.status === 'running' && 'text-foreground'
              )}
            >
              {step.status === 'completed' ? '☑' : '☐'} {step.text}
            </li>
          ))}
        </ul>
      )
    case 'plan':
      return <Markdown text={item.plan} />
    case 'tool':
      return toolKind(item.name) === 'other' ? (
        <Code text={JSON.stringify(item.input, null, 2)} />
      ) : null
    default:
      return null
  }
}

export function summary(item: Item, cwd: string) {
  switch (item.kind) {
    case 'command':
      return item.command
    case 'file_change':
      return relative(item.path, cwd)
    case 'web_search':
      return item.url ?? item.query ?? ''
    case 'subagent':
      return item.description
    case 'skill':
      return item.skill
    case 'tool': {
      const kind = toolKind(item.name)
      if (kind === 'read') return relative(readPath(item.input), cwd)
      if (kind === 'search') return text(item.input.pattern)
      return ''
    }
    default:
      return ''
  }
}

export function toolKind(name: string) {
  switch (name.toLowerCase()) {
    case 'read':
      return 'read'
    case 'grep':
    case 'glob':
      return 'search'
    default:
      return 'other'
  }
}

export function readPath(input: Record<string, unknown>) {
  return (
    [input.file_path, input.filePath, input.path]
      .map(text)
      .find((value) => value !== '') ?? ''
  )
}

export function editStats(item: FileChangeItem) {
  let added = 0
  let removed = 0
  for (const diff of item.diffs)
    for (const part of diffLines(diff.before, diff.after)) {
      if (part.added) added += part.count
      if (part.removed) removed += part.count
    }
  return { added, removed }
}

export function Code(props: { text: string }) {
  return (
    <pre className="text-foreground/80 text-2xs max-h-64 overflow-auto font-mono leading-relaxed whitespace-pre-wrap">
      {props.text}
    </pre>
  )
}

export function Diff(props: { before: string; after: string }) {
  return (
    <pre className="border-border/60 text-2xs max-h-80 overflow-auto rounded-md border font-mono leading-relaxed">
      {diffLines(props.before, props.after).flatMap((part, index) =>
        part.value
          .replace(/\n$/, '')
          .split('\n')
          .map((line, row) => (
            <div
              key={`${index}:${row}`}
              className={cn(
                'px-2 whitespace-pre-wrap',
                part.added && 'bg-diff-addition/10 text-diff-addition',
                part.removed && 'bg-diff-deletion/10 text-diff-deletion',
                !part.added && !part.removed && 'text-muted-foreground'
              )}
            >
              {part.added ? '+' : part.removed ? '-' : ' '} {line}
            </div>
          ))
      )}
    </pre>
  )
}

export function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function relative(file: string, cwd: string) {
  return file.startsWith(cwd + '/') ? file.slice(cwd.length + 1) : file
}
