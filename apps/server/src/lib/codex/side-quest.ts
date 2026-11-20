import type { SessionSettings } from '@offsite/core/config'
import type { Prompt } from '@offsite/core/items'
import { readConfig } from '../../storage/config.ts'
import { imageInputs } from './items.ts'
import { modePreset, threadPreset } from './presets.ts'
import { reply } from './requests.ts'
import { codexServer } from './run.ts'
import { turnReply } from './sessions.ts'
import type { ThreadStarted } from './types.ts'

export async function codexSideQuest(options: {
  sessionId: string
  settings: SessionSettings
  prompt: Prompt
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
  return turnReply(
    server,
    forked.thread.id,
    (id, method, params) => {
      try {
        server.reply(id, reply(method, params, 'deny', null))
      } catch (error) {
        server.replyError(
          id,
          error instanceof Error ? error.message : String(error)
        )
      }
    },
    async () => ({
      input: [
        {
          type: 'text',
          text: options.prompt.text,
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
  )
}
