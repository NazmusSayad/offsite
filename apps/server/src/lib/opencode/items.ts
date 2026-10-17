import type {
  Item,
  ItemStatus,
  Question,
  TodoStep,
} from '@offsite/core/protocol'
import type {
  FormField,
  FormInfo,
  SessionMessageAssistant,
  SessionMessageAssistantTool,
  SessionMessageInfo,
  ToolContent,
} from '@opencode/client'
import { isRecord } from '../claude/content.ts'
import { errorItem, hunks } from '../codex/index.ts'

type Base = { id: string; parent: string | null; time: number | null }

const toolStatuses: Record<
  SessionMessageAssistantTool['state']['status'],
  ItemStatus
> = {
  streaming: 'running',
  running: 'running',
  completed: 'completed',
  error: 'failed',
}

const todoStatuses: Record<string, TodoStep['status']> = {
  pending: 'pending',
  in_progress: 'running',
  completed: 'completed',
  cancelled: 'completed',
}

export function messageItems(
  message: SessionMessageInfo,
  parent: string | null
): Item[] {
  const base = { id: message.id, parent, time: message.time.created }
  switch (message.type) {
    case 'user':
      return [
        {
          ...base,
          kind: 'user',
          text: message.text,
          images: (message.files ?? [])
            .filter((file) => file.mime.startsWith('image/'))
            .map((file) => ({ mediaType: file.mime, data: file.data })),
          format: 'text',
        },
      ]
    case 'skill':
      return [
        {
          ...base,
          kind: 'skill',
          skill: message.name,
          output: '',
          status: 'completed',
        },
      ]
    case 'shell':
      return [
        {
          ...base,
          kind: 'command',
          command: message.command,
          description: '',
          output: message.output?.output ?? '',
          status:
            message.status === 'running'
              ? 'running'
              : message.status === 'exited'
                ? message.exit === 0
                  ? 'completed'
                  : 'failed'
                : 'stopped',
          background: null,
        },
      ]
    case 'assistant':
      return message.content.flatMap((part, index) =>
        partItems(message, part, index, parent)
      )
    case 'compaction':
      return message.status === 'failed'
        ? [{ ...errorItem(message.id, message.error.message), parent }]
        : [{ ...base, kind: 'compaction' }]
    case 'idle':
      return message.outcome === 'failed' && message.error !== undefined
        ? [{ ...errorItem(message.id, message.error.message), parent }]
        : []
    case 'agent-switched':
    case 'model-switched':
    case 'location-switched':
    case 'synthetic':
    case 'system':
      return []
  }
}

export function formQuestions(form: FormInfo): Question[] {
  return form.fields.flatMap((field) =>
    field.type === 'external'
      ? []
      : [
          {
            question: questionText(field),
            header: field.title ?? '',
            multiSelect: field.type === 'multiselect',
            options: fieldOptions(field),
          },
        ]
  )
}

export function formAnswer(form: FormInfo, answers: Record<string, string>) {
  return Object.fromEntries(
    form.fields.flatMap(
      (field): [string, string | number | boolean | string[]][] => {
        if (field.type === 'external') {
          return []
        }
        const answer = answers[questionText(field)]
        if (answer === undefined || answer === '') {
          return []
        }
        switch (field.type) {
          case 'string':
            return [[field.key, optionValue(field.options ?? [], answer)]]
          case 'multiselect':
            return [
              [
                field.key,
                answer
                  .split(', ')
                  .map((label) => optionValue(field.options, label)),
              ],
            ]
          case 'boolean':
            if (answer === 'Yes') {
              return [[field.key, true]]
            }
            if (answer === 'No') {
              return [[field.key, false]]
            }
            throw new Error(`${field.key} needs Yes or No`)
          case 'number':
          case 'integer':
            return [[field.key, Number(answer)]]
        }
      }
    )
  )
}

function partItems(
  message: SessionMessageAssistant,
  part: SessionMessageAssistant['content'][number],
  index: number,
  parent: string | null
): Item[] {
  const base = {
    id: `${message.id}:${index}`,
    parent,
    time: message.time.created,
  }
  switch (part.type) {
    case 'text':
      return part.text.trim() === ''
        ? []
        : [{ ...base, kind: 'assistant', text: part.text, message: message.id }]
    case 'reasoning':
      return part.text.trim() === ''
        ? []
        : [{ ...base, kind: 'reasoning', text: part.text.trim() }]
    case 'tool':
      return toolItems(
        { id: `${message.id}:${part.id}`, parent, time: part.time.created },
        part
      )
  }
}

function toolItems(base: Base, tool: SessionMessageAssistantTool): Item[] {
  const state = tool.state
  const status = toolStatuses[state.status]
  const input: Record<string, unknown> =
    state.status === 'streaming' ? {} : state.input
  const metadata: Record<string, unknown> =
    state.status === 'streaming' ? {} : (state.metadata ?? {})
  const output =
    state.status === 'error'
      ? state.error.message
      : state.status === 'completed'
        ? contentText(state.content)
        : ''
  switch (tool.name) {
    case 'shell':
      return [
        {
          ...base,
          kind: 'command',
          command: text(input.command),
          description: text(input.description),
          output,
          status,
          background: null,
        },
      ]
    case 'edit':
      return [
        {
          ...base,
          kind: 'file_change',
          path: text(input.path ?? input.filePath),
          diffs: [
            { before: text(input.oldString), after: text(input.newString) },
          ],
          output,
          status,
        },
      ]
    case 'write':
      return [
        {
          ...base,
          kind: 'file_change',
          path: text(input.path ?? input.filePath),
          diffs: [{ before: '', after: text(input.content) }],
          output,
          status,
        },
      ]
    case 'patch':
    case 'apply_patch':
      if (!Array.isArray(metadata.files)) {
        break
      }
      return metadata.files.map((file: unknown, index) => ({
        ...base,
        id: `${base.id}:${index}`,
        kind: 'file_change',
        path: text(record(file).file),
        diffs: hunks(text(record(file).patch)),
        output,
        status,
      }))
    case 'todowrite':
      return [
        {
          ...base,
          kind: 'todo_list',
          steps: list(input.todos).map((todo) => ({
            text: text(record(todo).content),
            status: todoStatuses[text(record(todo).status)] ?? 'pending',
          })),
        },
      ]
    case 'subagent':
    case 'task':
      return [
        {
          ...base,
          kind: 'subagent',
          agent: text(input.agent ?? input.subagent_type) || 'Agent',
          description: text(input.description),
          agentId:
            typeof metadata.sessionID === 'string' ? metadata.sessionID : null,
          status,
        },
      ]
    case 'webfetch':
    case 'websearch':
      return [
        {
          ...base,
          kind: 'web_search',
          query: tool.name === 'websearch' ? text(input.query) : null,
          url: tool.name === 'webfetch' ? text(input.url) : null,
          results: [],
          output,
          status,
        },
      ]
    case 'question': {
      const questions = list(input.questions).map((item) => ({
        question: text(record(item).question),
        header: text(record(item).header),
        multiSelect: record(item).multiple === true,
        options: list(record(item).options).map((option) => ({
          label: text(record(option).label),
          description: text(record(option).description),
        })),
      }))
      const answers = metadata.answers
      return [
        {
          ...base,
          kind: 'question',
          questions,
          answers: Array.isArray(answers)
            ? Object.fromEntries(
                questions.map((question, index) => [
                  question.question,
                  list(answers[index]).map(text).join(', '),
                ])
              )
            : null,
          status,
        },
      ]
    }
    case 'skill':
      return [{ ...base, kind: 'skill', skill: text(input.id), output, status }]
  }
  return [{ ...base, kind: 'tool', name: tool.name, input, output, status }]
}

function questionText(field: Exclude<FormField, { type: 'external' }>) {
  return field.description ?? field.title ?? field.key
}

function fieldOptions(field: Exclude<FormField, { type: 'external' }>) {
  switch (field.type) {
    case 'string':
    case 'multiselect':
      return (field.options ?? []).map((option) => ({
        label: option.label,
        description: option.description ?? '',
      }))
    case 'boolean':
      return [
        { label: 'Yes', description: '' },
        { label: 'No', description: '' },
      ]
    case 'number':
    case 'integer':
      return []
  }
}

function optionValue(
  options: { value: string; label: string }[],
  label: string
) {
  return options.find((option) => option.label === label)?.value ?? label
}

function contentText(content: ToolContent[]) {
  return content
    .map((block) => (block.type === 'text' ? block.text : block.uri))
    .join('\n')
}

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
