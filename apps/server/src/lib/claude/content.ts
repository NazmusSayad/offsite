import { randomUUID } from 'node:crypto'
import type {
  SDKResultMessage,
  TerminalReason,
} from '@anthropic-ai/claude-agent-sdk'
import type { Prompt } from '@offsite/core/items'

export type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'image'; mediaType: string; data: string | null }
  | {
      type: 'tool_use'
      id: string
      name: string
      input: Record<string, unknown>
    }
  | {
      type: 'tool_result'
      toolUseId: string
      content: Block[]
      isError: boolean
      answers: Record<string, string> | null
    }

export type Message =
  | {
      type: 'user' | 'assistant'
      uuid: string
      time: number | null
      content: Block[]
      parent: string | null
    }
  | {
      type: 'notice'
      uuid: string
      time: number | null
      text: string
      isError: boolean
    }
  | {
      type: 'compaction'
      uuid: string
      time: number | null
      summary: string | null
    }

export function toMessage(
  type: 'user' | 'assistant',
  item: {
    uuid: string
    message: unknown
    parent_tool_use_id: string | null
    tool_use_result?: unknown
  },
  time: number | null
): Extract<Message, { type: 'user' | 'assistant' }> {
  return {
    type,
    uuid: item.uuid,
    time,
    content: isRecord(item.message)
      ? toBlocks(item.message.content, answersOf(item.tool_use_result))
      : [],
    parent: item.parent_tool_use_id,
  }
}

export function promptMessage(prompt: Prompt, uuid: string): Message {
  return {
    type: 'user',
    uuid,
    time: Date.now(),
    content: [
      ...(prompt.text === ''
        ? []
        : [{ type: 'text' as const, text: prompt.text }]),
      ...prompt.images.map((image) => ({ type: 'image' as const, ...image })),
    ],
    parent: null,
  }
}

export function notice(text: string): Message {
  return {
    type: 'notice',
    uuid: randomUUID(),
    time: Date.now(),
    text,
    isError: true,
  }
}

export function resultNotice(message: SDKResultMessage) {
  if (
    message.subtype === 'success' ||
    message.terminal_reason === 'aborted_streaming' ||
    message.terminal_reason === 'aborted_tools'
  ) {
    return null
  }
  return notice(
    message.errors
      .filter((error) => !error.startsWith('[ede_diagnostic]'))
      .join('\n') || message.subtype
  )
}

const failingReasons: (TerminalReason | undefined)[] = [
  'api_error',
  'malformed_tool_use_exhausted',
  'budget_exhausted',
  'structured_output_retry_exhausted',
  'tool_deferred_unavailable',
  'turn_setup_failed',
  'blocking_limit',
  'rapid_refill_breaker',
  'prompt_too_long',
  'image_error',
  'model_error',
]

export function turnFailed(message: SDKResultMessage) {
  if (
    message.terminal_reason === 'aborted_tools' ||
    message.terminal_reason === 'aborted_streaming'
  ) {
    return false
  }
  if (message.subtype === 'success') {
    return (
      message.api_error_status === 429 ||
      message.api_error_status === 529 ||
      (message.is_error && message.api_error_status === 403) ||
      failingReasons.includes(message.terminal_reason)
    )
  }
  const errors = message.errors.join('\n').toLowerCase()
  return !errors.includes('interrupt') && !errors.includes('cancel')
}

export function contextTokens(message: unknown) {
  if (!isRecord(message) || !isRecord(message.usage)) {
    return null
  }
  const usage = message.usage
  return [
    usage.input_tokens,
    usage.cache_creation_input_tokens,
    usage.cache_read_input_tokens,
    usage.output_tokens,
  ].reduce<number>(
    (total, value) => total + (typeof value === 'number' ? value : 0),
    0
  )
}

function answersOf(output: unknown) {
  if (!isRecord(output) || !isRecord(output.answers)) {
    return null
  }
  const answers: Record<string, string> = {}
  for (const [question, answer] of Object.entries(output.answers)) {
    if (typeof answer !== 'string') {
      return null
    }
    answers[question] = answer
  }
  return answers
}

function toBlocks(
  content: unknown,
  answers: Record<string, string> | null
): Block[] {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }]
  }
  if (!Array.isArray(content)) {
    return []
  }
  return content.flatMap((block): Block[] => {
    if (!isRecord(block)) {
      return []
    }
    switch (block.type) {
      case 'text':
        return typeof block.text === 'string' &&
          !block.text.startsWith('<system-reminder>') &&
          !block.text.startsWith('<local-command-caveat>')
          ? [{ type: 'text', text: block.text }]
          : []
      case 'thinking':
        return typeof block.thinking === 'string' && block.thinking !== ''
          ? [{ type: 'thinking', thinking: block.thinking }]
          : []
      case 'image': {
        const source = block.source
        return isRecord(source) &&
          source.type === 'base64' &&
          typeof source.media_type === 'string' &&
          typeof source.data === 'string'
          ? [{ type: 'image', mediaType: source.media_type, data: source.data }]
          : []
      }
      case 'tool_use':
        return typeof block.id === 'string' &&
          typeof block.name === 'string' &&
          isRecord(block.input)
          ? [
              {
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.input,
              },
            ]
          : []
      case 'tool_result':
        return typeof block.tool_use_id === 'string'
          ? [
              {
                type: 'tool_result',
                toolUseId: block.tool_use_id,
                content: toBlocks(block.content, null).filter(
                  (item) => item.type === 'text'
                ),
                isError: block.is_error === true,
                answers,
              },
            ]
          : []
      default:
        return []
    }
  })
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function userText(value: string): {
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
  if (output !== null) {
    return { format: 'output', text: output[1] }
  }
  const bash = /^<bash-input>(.*)<\/bash-input>$/s.exec(value.trim())
  if (bash !== null) {
    return { format: 'command', text: `$ ${bash[1]}` }
  }
  const bashOutput =
    /^<bash-stdout>(.*)<\/bash-stdout><bash-stderr>(.*)<\/bash-stderr>$/s.exec(
      value.trim()
    )
  if (bashOutput !== null) {
    return { format: 'output', text: `${bashOutput[1]}${bashOutput[2]}`.trim() }
  }
  return { format: 'text', text: value }
}
