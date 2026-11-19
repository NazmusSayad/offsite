import { randomUUID } from 'node:crypto'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { SessionSettings } from '@offsite/core/config'
import type { Prompt } from '@offsite/core/items'
import { runOptions } from './claude.ts'
import { toUserInputs } from './skills.ts'

export async function claudeSideQuest(options: {
  sessionId: string
  cwd: string
  settings: SessionSettings
  prompt: Prompt
}) {
  const uuid = randomUUID()
  let asked = false
  const conversation = query({
    prompt: (async function* () {
      yield* toUserInputs(options.prompt, uuid, undefined, [])
    })(),
    options: {
      ...runOptions({
        sessionId: options.sessionId,
        cwd: options.cwd,
        resume: true,
        resumeAt: null,
        settings: options.settings,
      }),
      persistSession: false,
      canUseTool: async (_name, input) => ({
        behavior: 'allow',
        updatedInput: input,
      }),
    },
  })
  for await (const message of conversation) {
    if (message.type === 'user' && message.uuid === uuid) {
      asked = true
    }
    if (message.type !== 'result' || !asked) {
      continue
    }
    if (message.subtype !== 'success') {
      throw new Error(message.errors.join('\n'))
    }
    if (message.is_error) {
      throw new Error(message.result)
    }
    return message.result.trim()
  }
  throw new Error('Claude did not reply')
}
