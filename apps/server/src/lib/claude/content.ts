import { randomUUID, type UUID } from 'node:crypto'
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import type { Prompt } from '@offsite/core/protocol'

const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

type ImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

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
  | { type: 'compaction'; uuid: string; time: number | null }

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

export function toUserInput(
  prompt: Prompt,
  uuid: UUID,
  priority: 'next' | undefined
): SDKUserMessage {
  for (const image of prompt.images) {
    if (!imageTypes.includes(image.mediaType))
      {throw new Error(`${image.mediaType} images are not supported`)}
  }
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [
        ...prompt.images.map((image) => ({
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: image.mediaType as ImageType,
            data: image.data,
          },
        })),
        ...(prompt.text === ''
          ? []
          : [{ type: 'text' as const, text: prompt.text }]),
      ],
    },
    parent_tool_use_id: null,
    uuid,
    ...(priority === undefined ? {} : { priority }),
  }
}

export function promptMessage(prompt: Prompt, uuid: string): Message {
  return {
    type: 'user',
    uuid,
    time: Date.now(),
    content: [
      ...prompt.images.map((image) => ({ type: 'image' as const, ...image })),
      ...(prompt.text === ''
        ? []
        : [{ type: 'text' as const, text: prompt.text }]),
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
