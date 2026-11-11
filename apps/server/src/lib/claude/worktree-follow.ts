import { realpath } from 'node:fs/promises'
import type {
  SDKAssistantMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { followClaudeFolder } from '../../services/worktree-sessions.ts'
import { logger } from '../log.ts'
import { isRecord } from './content.ts'

const log = logger.withTag('claude')

export function followWorktree(
  sessionId: string,
  cwd: string,
  tools: Map<string, string>,
  message: SDKAssistantMessage | SDKUserMessage
) {
  if (message.parent_tool_use_id !== null) {
    return
  }
  if (message.type === 'assistant') {
    for (const block of message.message.content) {
      if (
        block.type === 'tool_use' &&
        (block.name === 'EnterWorktree' || block.name === 'ExitWorktree')
      ) {
        tools.set(block.id, block.name)
      }
    }
    return
  }
  const content = message.message.content
  const result = message.tool_use_result
  if (typeof content === 'string' || !isRecord(result)) {
    return
  }
  for (const block of content) {
    if (block.type !== 'tool_result' || block.is_error === true) {
      continue
    }
    const name = tools.get(block.tool_use_id)
    if (name === 'EnterWorktree' && typeof result.worktreePath === 'string') {
      follow(sessionId, cwd, result.worktreePath, 'entered')
    }
    if (name === 'ExitWorktree' && typeof result.restoredCwd === 'string') {
      follow(sessionId, cwd, result.restoredCwd, 'left')
    }
  }
}

export async function followStart(
  sessionId: string,
  cwd: string,
  folder: string
) {
  try {
    if ((await realpath(folder)) !== (await realpath(cwd))) {
      await followClaudeFolder(sessionId, cwd, folder, 'started')
    }
  } catch (error) {
    log.warn(`${sessionId} could not follow its worktree:`, error)
  }
}

function follow(
  sessionId: string,
  cwd: string,
  folder: string,
  change: 'entered' | 'left'
) {
  followClaudeFolder(sessionId, cwd, folder, change).catch((error: unknown) =>
    log.warn(`${sessionId} could not follow its worktree:`, error)
  )
}
