import type { SessionSettings } from '@offsite/core/config'
import type { Prompt } from '@offsite/core/items'
import type { SideQuestExchange } from '@offsite/core/side-quests'
import { readConfig } from '../../storage/config.ts'
import { sideQuestPrompt } from '../side-quest-prompt.ts'
import { imageInputs } from './items.ts'
import { modePreset, threadPreset } from './presets.ts'
import { reply } from './requests.ts'
import { codexServer } from './run.ts'
import type { ThreadItem, ThreadStarted, Turn } from './types.ts'

export async function codexSideQuest(options: {
  sessionId: string
  settings: SessionSettings
  prompt: Prompt
  history: SideQuestExchange[]
}) {
  const preset = modePreset(readConfig().codex.sideQuestMode)
  if (preset === null) {
    throw new Error('Codex side quests have no permission mode')
  }
  const server = codexServer(options.settings)
  const forked = await server.request<ThreadStarted>('thread/fork', {
    threadId: options.sessionId,
    ephemeral: true,
    excludeTurns: true,
    approvalsReviewer: 'user',
    ...threadPreset(options.settings),
  })
  const threadId = forked.thread.id
  const answer = Promise.withResolvers<string>()
  let text = ''
  server.threads.set(threadId, {
    notify: (method, params) => {
      if (method === 'item/completed') {
        const item = params.item as ThreadItem
        if (item.type === 'agentMessage') {
          text = item.text
        }
      }
      if (method !== 'turn/completed') {
        return
      }
      const turn = params.turn as Turn
      if (turn.status === 'completed') {
        answer.resolve(text.trim())
      } else {
        answer.reject(new Error(turn.error?.message ?? 'Codex did not reply'))
      }
    },
    request: (id, method, params) => {
      try {
        server.reply(id, reply(method, params, 'deny', null))
      } catch (error) {
        server.replyError(
          id,
          error instanceof Error ? error.message : String(error)
        )
      }
    },
    exited: () => answer.reject(new Error('Codex stopped')),
  })
  try {
    await server.request('turn/start', {
      threadId,
      input: [
        {
          type: 'text',
          text: sideQuestPrompt(options.history, options.prompt.text),
          text_elements: [],
        },
        ...(await imageInputs(options.sessionId, options.prompt.images)),
      ],
      model: options.settings.model ?? forked.model,
      approvalsReviewer: 'user',
      sandboxPolicy: preset.sandboxPolicy,
      ...(options.settings.effort === null
        ? {}
        : { effort: options.settings.effort }),
    })
    return await answer.promise
  } finally {
    server.threads.delete(threadId)
    await server.request('thread/unsubscribe', { threadId })
  }
}
