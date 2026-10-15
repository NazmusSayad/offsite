import type { SDKControlGetContextUsageResponse } from '@anthropic-ai/claude-agent-sdk'
import type { Block, Context, Message } from './protocol.ts'

export function toMessage(
  type: 'user' | 'assistant',
  item: { uuid: string; message: unknown; parent_tool_use_id: string | null },
  time: number | null
): Message {
  return {
    type,
    uuid: item.uuid,
    time,
    content: isRecord(item.message) ? toBlocks(item.message.content) : [],
    parent: item.parent_tool_use_id,
  }
}

export function contextTokens(message: unknown) {
  if (!isRecord(message) || !isRecord(message.usage)) return null
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

export function toContext(usage: SDKControlGetContextUsageResponse): Context {
  const messages = usage.messageBreakdown
  const sections = [
    {
      title: 'Messages',
      items:
        messages === undefined
          ? []
          : [
              { name: 'User messages', tokens: messages.userMessageTokens },
              {
                name: 'Assistant messages',
                tokens: messages.assistantMessageTokens,
              },
              { name: 'Tool calls', tokens: messages.toolCallTokens },
              { name: 'Tool results', tokens: messages.toolResultTokens },
              { name: 'Attachments', tokens: messages.attachmentTokens },
            ],
    },
    {
      title: 'Tools used',
      items: (messages?.toolCallsByType ?? []).map((tool) => ({
        name: tool.name,
        tokens: tool.callTokens + tool.resultTokens,
      })),
    },
    {
      title: 'Memory files',
      items: usage.memoryFiles.map((file) => ({
        name: file.path,
        tokens: file.tokens,
      })),
    },
    {
      title: 'MCP tools',
      items: usage.mcpTools.map((tool) => ({
        name: `${tool.serverName} · ${tool.name}`,
        tokens: tool.tokens,
      })),
    },
    {
      title: 'Agents',
      items: usage.agents.map((agent) => ({
        name: agent.agentType,
        tokens: agent.tokens,
      })),
    },
    {
      title: 'Skills',
      items: (usage.skills?.skillFrontmatter ?? []).map((skill) => ({
        name: skill.name,
        tokens: skill.tokens,
      })),
    },
    {
      title: 'Last response',
      items:
        usage.apiUsage === null
          ? []
          : [
              { name: 'Input', tokens: usage.apiUsage.input_tokens },
              {
                name: 'Cache read',
                tokens: usage.apiUsage.cache_read_input_tokens,
              },
              {
                name: 'Cache write',
                tokens: usage.apiUsage.cache_creation_input_tokens,
              },
              { name: 'Output', tokens: usage.apiUsage.output_tokens },
            ],
    },
  ]
  return {
    tokens: usage.totalTokens,
    window: usage.maxTokens,
    model: usage.model,
    categories: usage.categories.flatMap((category) =>
      category.kind === 'deferred'
        ? []
        : [
            {
              name: category.name,
              tokens: category.tokens,
              kind: category.kind,
            },
          ]
    ),
    sections: sections
      .map((section) => ({
        title: section.title,
        items: section.items.filter((item) => item.tokens > 0),
      }))
      .filter((section) => section.items.length > 0),
  }
}

function toBlocks(content: unknown): Block[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (!Array.isArray(content)) return []
  return content.flatMap((block): Block[] => {
    if (!isRecord(block)) return []
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
                content: toBlocks(block.content),
                isError: block.is_error === true,
              },
            ]
          : []
      default:
        return []
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
