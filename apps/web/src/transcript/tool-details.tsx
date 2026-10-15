import type { Block } from '@server/protocol'
import { diffLines } from 'diff'
import { cn } from '@/lib/utils'
import { Markdown } from '@/markdown/markdown'

export type ToolUse = Extract<Block, { type: 'tool_use' }>

export type ToolResult = Extract<Block, { type: 'tool_result' }>

export type WorkEntry =
  | { kind: 'thinking'; key: string; text: string }
  | { kind: 'tool'; key: string; tool: ToolUse }

type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed' }

type Edit = { old_string: string; new_string: string }

export function ToolDetails(props: { tool: ToolUse }) {
  const input = props.tool.input
  switch (props.tool.name) {
    case 'Bash':
      return <Code text={`$ ${text(input.command)}`} />
    case 'Edit':
      return (
        <Diff before={text(input.old_string)} after={text(input.new_string)} />
      )
    case 'MultiEdit':
      return (
        <div className="flex flex-col gap-2">
          {(input.edits as Edit[]).map((edit, index) => (
            <Diff
              key={index}
              before={edit.old_string}
              after={edit.new_string}
            />
          ))}
        </div>
      )
    case 'Write':
      return <Diff before="" after={text(input.content)} />
    case 'TodoWrite':
      return (
        <ul className="flex flex-col gap-1 text-sm">
          {(input.todos as Todo[]).map((todo, index) => (
            <li
              key={index}
              className={cn(
                'text-secondary-label',
                todo.status === 'completed' &&
                  'text-muted-foreground line-through',
                todo.status === 'in_progress' && 'text-foreground'
              )}
            >
              {todo.status === 'completed' ? '☑' : '☐'} {todo.content}
            </li>
          ))}
        </ul>
      )
    case 'ExitPlanMode':
      return <Markdown text={text(input.plan)} />
    case 'Read':
    case 'Glob':
    case 'Grep':
    case 'WebFetch':
    case 'WebSearch':
      return null
    default:
      return <Code text={JSON.stringify(input, null, 2)} />
  }
}

export function summary(tool: ToolUse, cwd: string) {
  const input = tool.input
  switch (tool.name) {
    case 'Bash':
      return text(input.command)
    case 'Read':
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
      return relative(text(input.file_path), cwd)
    case 'NotebookEdit':
      return relative(text(input.notebook_path), cwd)
    case 'Grep':
    case 'Glob':
      return text(input.pattern)
    case 'WebFetch':
      return text(input.url)
    case 'WebSearch':
      return text(input.query)
    case 'Task':
    case 'Agent':
      return text(input.description)
    case 'Skill':
      return text(input.skill)
    default:
      return ''
  }
}

export function editStats(tool: ToolUse) {
  const input = tool.input
  const pairs =
    tool.name === 'Edit'
      ? [{ before: text(input.old_string), after: text(input.new_string) }]
      : tool.name === 'MultiEdit'
        ? (input.edits as Edit[]).map((edit) => ({
            before: edit.old_string,
            after: edit.new_string,
          }))
        : tool.name === 'Write'
          ? [{ before: '', after: text(input.content) }]
          : null
  if (pairs === null) return null
  let added = 0
  let removed = 0
  for (const pair of pairs)
    for (const part of diffLines(pair.before, pair.after)) {
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

export function resultText(result: ToolResult) {
  return result.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
}

export function editedFile(tool: ToolUse) {
  return tool.name === 'NotebookEdit'
    ? text(tool.input.notebook_path)
    : text(tool.input.file_path)
}

export function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function relative(file: string, cwd: string) {
  return file.startsWith(cwd + '/') ? file.slice(cwd.length + 1) : file
}
