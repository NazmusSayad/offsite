import { type Block, isRecord, type Message } from './content.ts'
import type {
  Background,
  Item,
  ItemStatus,
  PermissionRequest,
  Question,
  TodoStep,
} from './protocol.ts'

type ToolUse = Extract<Block, { type: 'tool_use' }>

type ToolResult = Extract<Block, { type: 'tool_result' }>

const notifications = /<task-notification>([\s\S]*?)<\/task-notification>/g

const taskStatuses = new Map<string, ItemStatus>([
  ['completed', 'completed'],
  ['failed', 'failed'],
  ['killed', 'stopped'],
  ['stopped', 'stopped'],
])

const todoStatuses = new Map<string, TodoStep['status']>([
  ['pending', 'pending'],
  ['in_progress', 'running'],
  ['completed', 'completed'],
])

export function toItems(messages: Message[]): Item[] {
  const items: Item[] = []
  const tools = new Map<string, number>()
  const owners = new Map<string, number>()
  const stops = new Map<string, string>()

  function change(index: number, patch: Partial<Item>) {
    items[index] = { ...items[index], ...patch } as Item
  }

  for (const message of messages) {
    const base = { parent: null, time: message.time }
    if (message.type === 'compaction') {
      items.push({ ...base, id: message.uuid, kind: 'compaction' })
      continue
    }
    if (message.type === 'notice') {
      items.push({
        ...base,
        id: message.uuid,
        kind: message.isError ? 'error' : 'notice',
        text: message.text,
      })
      continue
    }
    if (message.type === 'assistant') {
      message.content.forEach((block, index) => {
        const id = `${message.uuid}:${index}`
        const parent = message.parent
        switch (block.type) {
          case 'text':
            if (block.text.trim() !== '')
              items.push({
                id,
                parent,
                time: message.time,
                kind: 'assistant',
                text: block.text,
                message: message.uuid,
              })
            break
          case 'thinking':
            if (block.thinking.trim() !== '')
              items.push({
                id,
                parent,
                time: message.time,
                kind: 'reasoning',
                text: block.thinking,
              })
            break
          case 'tool_use': {
            if (block.name === 'SendMessage') {
              const owner = owners.get(text(block.input.to))
              if (owner !== undefined) change(owner, { status: 'running' })
            }
            if (block.name === 'TaskStop')
              stops.set(block.id, text(block.input.task_id))
            tools.set(block.id, items.length)
            items.push(
              toolItem(block, parent, message.time, (to) => {
                const owner = owners.get(to)
                return owner === undefined ? null : items[owner].id
              })
            )
            break
          }
          case 'image':
          case 'tool_result':
            break
        }
      })
      continue
    }
    const texts: { format: 'text' | 'command' | 'output'; text: string }[] = []
    const images = message.content.flatMap((block) =>
      block.type === 'image'
        ? [{ mediaType: block.mediaType, data: block.data }]
        : []
    )
    for (const block of message.content) {
      if (block.type === 'tool_result') {
        const index = tools.get(block.toolUseId)
        if (index === undefined) continue
        const result = applyResult(items[index], block)
        items[index] = result
        if (result.kind === 'subagent' && result.agentId !== null)
          owners.set(result.agentId, index)
        if (
          result.kind === 'command' &&
          result.background !== null &&
          result.background.taskId !== null
        )
          owners.set(result.background.taskId, index)
        const stopped = stops.get(block.toolUseId)
        const owner = stopped === undefined ? undefined : owners.get(stopped)
        if (owner !== undefined && !block.isError)
          change(owner, { status: 'stopped' })
        continue
      }
      if (block.type !== 'text') continue
      if (block.text.startsWith('<task-notification>')) {
        let count = 0
        for (const match of block.text.matchAll(notifications)) {
          const body = match[1]
          const status = taskStatuses.get(
            /<status>(\w+)<\/status>/.exec(body)?.[1] ?? ''
          )
          const event = /<event>([\s\S]*?)<\/event>/.exec(body)?.[1]
          for (const id of body.matchAll(/<task-id>(\w+)<\/task-id>/g)) {
            const owner = owners.get(id[1])
            if (owner === undefined) continue
            if (status !== undefined) change(owner, { status })
            const task = items[owner]
            if (
              event !== undefined &&
              task.kind === 'command' &&
              task.background !== null
            )
              change(owner, {
                background: {
                  ...task.background,
                  events: [...task.background.events, event],
                },
              })
          }
          items.push({
            id: `${message.uuid}:${count}`,
            parent: message.parent,
            time: message.time,
            kind: 'notice',
            text:
              /<summary>([\s\S]*?)<\/summary>/.exec(body)?.[1] ??
              'Background task updated',
          })
          count += 1
        }
        continue
      }
      if (block.text.startsWith('[Request interrupted by user')) {
        items.push({
          id: message.uuid,
          parent: message.parent,
          time: message.time,
          kind: 'notice',
          text: 'Interrupted',
        })
        continue
      }
      texts.push(userText(block.text))
    }
    if (texts.length === 0 && images.length === 0) continue
    items.push({
      id: message.uuid,
      parent: message.parent,
      time: message.time,
      kind: 'user',
      text: texts.map((part) => part.text).join('\n'),
      images,
      format: texts[0]?.format ?? 'text',
    })
  }
  return items
}

export function toRequest(options: {
  id: string
  toolName: string
  input: Record<string, unknown>
  title: string | null
  canAlwaysAllow: boolean
}): PermissionRequest {
  switch (options.toolName) {
    case 'AskUserQuestion':
      return {
        id: options.id,
        kind: 'question',
        questions: options.input.questions as Question[],
      }
    case 'ExitPlanMode':
      return { id: options.id, kind: 'plan', plan: text(options.input.plan) }
    default:
      return {
        id: options.id,
        kind: 'approval',
        title: options.title ?? `Allow ${options.toolName}?`,
        canAlwaysAllow: options.canAlwaysAllow,
        item: toolItem(
          {
            type: 'tool_use',
            id: options.id,
            name: options.toolName,
            input: options.input,
          },
          null,
          null,
          () => null
        ),
      }
  }
}

function toolItem(
  tool: ToolUse,
  parent: string | null,
  time: number | null,
  ownerOf: (id: string) => string | null
): Item {
  const input = tool.input
  const base = { id: tool.id, parent, time }
  switch (tool.name) {
    case 'Bash':
      return {
        ...base,
        kind: 'command',
        command: text(input.command),
        description: text(input.description),
        output: '',
        status: 'running',
        background:
          input.run_in_background === true
            ? { taskId: null, outputPath: null, events: [] }
            : null,
      }
    case 'Monitor':
      return {
        ...base,
        kind: 'command',
        command:
          text(input.command) || (isRecord(input.ws) ? text(input.ws.url) : ''),
        description: text(input.description),
        output: '',
        status: 'running',
        background: { taskId: null, outputPath: null, events: [] },
      }
    case 'Edit':
      return {
        ...base,
        kind: 'file_change',
        path: text(input.file_path),
        diffs: [
          { before: text(input.old_string), after: text(input.new_string) },
        ],
        output: '',
        status: 'running',
      }
    case 'MultiEdit':
      return {
        ...base,
        kind: 'file_change',
        path: text(input.file_path),
        diffs: (
          input.edits as { old_string: string; new_string: string }[]
        ).map((edit) => ({ before: edit.old_string, after: edit.new_string })),
        output: '',
        status: 'running',
      }
    case 'Write':
      return {
        ...base,
        kind: 'file_change',
        path: text(input.file_path),
        diffs: [{ before: '', after: text(input.content) }],
        output: '',
        status: 'running',
      }
    case 'NotebookEdit':
      return {
        ...base,
        kind: 'file_change',
        path: text(input.notebook_path),
        diffs: [],
        output: '',
        status: 'running',
      }
    case 'WebFetch':
      return {
        ...base,
        kind: 'web_search',
        query: null,
        url: text(input.url),
        results: [],
        output: '',
        status: 'running',
      }
    case 'WebSearch':
      return {
        ...base,
        kind: 'web_search',
        query: text(input.query),
        url: null,
        results: [],
        output: '',
        status: 'running',
      }
    case 'Skill':
      return {
        ...base,
        kind: 'skill',
        skill: text(input.skill),
        output: '',
        status: 'running',
      }
    case 'TodoWrite':
      return {
        ...base,
        kind: 'todo_list',
        steps: (input.todos as { content: string; status: string }[]).map(
          (todo) => ({
            text: todo.content,
            status: todoStatuses.get(todo.status) ?? 'pending',
          })
        ),
      }
    case 'ExitPlanMode':
      return { ...base, kind: 'plan', plan: text(input.plan) }
    case 'AskUserQuestion':
      return {
        ...base,
        kind: 'question',
        questions: input.questions as Question[],
        answers: null,
        status: 'running',
      }
    case 'Agent':
    case 'Task': {
      const agent = text(input.subagent_type)
      return {
        ...base,
        kind: 'subagent',
        agent: agent === '' ? 'general-purpose' : agent,
        description: text(input.description),
        agentId: null,
        status: 'running',
      }
    }
    case 'SendMessage': {
      const summary = text(input.summary)
      return {
        ...base,
        kind: 'agent_message',
        target: ownerOf(text(input.to)),
        summary: summary === '' ? text(input.message).split('\n')[0] : summary,
        status: 'running',
      }
    }
    default:
      return {
        ...base,
        kind: 'tool',
        name: tool.name,
        input,
        output: '',
        status: 'running',
      }
  }
}

function applyResult(item: Item, result: ToolResult): Item {
  const output = result.content
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('\n')
  const status = result.isError ? 'failed' : 'completed'
  switch (item.kind) {
    case 'command': {
      if (item.background === null) return { ...item, output, status }
      const shell =
        /^Command running in background with ID: (\w+)\. Output is being written to: (.+?\.output)\./.exec(
          output
        )
      const monitor = /^Monitor started \(task (\w+),/.exec(output)
      const background: Background =
        shell !== null
          ? { ...item.background, taskId: shell[1], outputPath: shell[2] }
          : monitor !== null
            ? { ...item.background, taskId: monitor[1] }
            : item.background
      return {
        ...item,
        output,
        background,
        status: background.taskId !== null ? 'running' : status,
      }
    }
    case 'subagent':
      return {
        ...item,
        agentId: /agentId: (\w+)/.exec(output)?.[1] ?? null,
        status: output.startsWith('Async agent launched') ? 'running' : status,
      }
    case 'web_search':
      return {
        ...item,
        output,
        status,
        results: [
          ...output.matchAll(/"title":"((?:[^"\\]|\\.)*)","url":"([^"]+)"/g),
        ].map((match) => ({ title: match[1], url: match[2] })),
      }
    case 'question':
      return { ...item, answers: result.answers, status }
    case 'file_change':
    case 'skill':
    case 'tool':
    case 'agent_message':
      return { ...item, output, status } as Item
    default:
      return item
  }
}

function userText(value: string): {
  format: 'text' | 'command' | 'output'
  text: string
} {
  const command = /<command-name>(.*?)<\/command-name>/s.exec(value)
  if (command !== null) {
    const args = /<command-args>(.*?)<\/command-args>/s.exec(value)
    return {
      format: 'command',
      text: `${command[1]} ${args?.[1] ?? ''}`.trim(),
    }
  }
  const output =
    /^<local-command-(?:stdout|stderr)>(.*)<\/local-command-(?:stdout|stderr)>$/s.exec(
      value.trim()
    )
  if (output !== null) return { format: 'output', text: output[1] }
  return { format: 'text', text: value }
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}
