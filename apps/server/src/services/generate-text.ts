import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type Options, query } from '@anthropic-ai/claude-agent-sdk'
import {
  DEFAULT_SMALL_MODELS,
  type SessionSettings,
} from '@offsite/core/config'
import { claudeOptions } from '../lib/claude/index.ts'
import { codexText } from '../lib/codex/index.ts'
import { runs } from '../lib/live.ts'
import { openCodeText } from '../lib/opencode/index.ts'
import { readConfig } from '../storage/config.ts'
import { db } from '../storage/db.ts'
import { lastSettings } from '../storage/interactions.ts'
import { generations } from '../storage/schema.ts'
import { assertEnabled } from './accounts.ts'
import { places } from './project-worktrees.ts'

const ISOLATED = {
  'session-title': true,
  'branch-name': true,
  'notification-summary': true,
  'review-guide': true,
  'pull-request': false,
  'commit-message': false,
  'finished-check': true,
} satisfies Record<(typeof generations.$inferSelect)['task'], boolean>

export type Thread = Pick<SessionSettings, 'provider' | 'accountId' | 'model'>

export type GenerationLink = {
  sessionId: string | null
  itemId: string | null
  taskIds: string[] | null
}

export function generationLinks(cwd: string, link: GenerationLink) {
  const place = places().find((entry) => entry[0] === cwd)
  return {
    ...link,
    projectId: place === undefined ? null : place[1].projectId,
    worktreeId: place === undefined ? null : place[1].worktreeId,
  }
}

export function threadSettings(sessionId: string | null): Thread {
  const run = sessionId === null ? undefined : runs.get(sessionId)
  if (run !== undefined) {
    return run.settings
  }
  const last = lastSettings(sessionId)
  if (last === undefined) {
    throw new Error(
      'Send a message in a thread first, so offsite knows which account to use'
    )
  }
  return last
}

function smallModel(thread: Thread) {
  const chosen = readConfig()[thread.provider].smallModel
  if (chosen !== null) {
    return chosen
  }
  if (thread.provider !== 'opencode') {
    return DEFAULT_SMALL_MODELS[thread.provider]
  }
  if (thread.model === null) {
    throw new Error(
      'Choose a model for this thread, or a small model in Settings → OpenCode'
    )
  }
  return thread.model
}

export async function generateText(
  task: keyof typeof ISOLATED,
  thread: Thread,
  cwd: string,
  text: { instructions: string; prompt: string; link: GenerationLink },
  abortController?: AbortController
) {
  assertEnabled(thread.provider, thread.accountId)
  const model = smallModel(thread)
  async function reply(model: string) {
    if (thread.provider === 'codex') {
      return codexText(
        thread.accountId,
        cwd,
        model,
        text.instructions,
        text.prompt
      )
    }
    if (thread.provider === 'opencode') {
      return openCodeText(cwd, model, `${text.instructions}\n\n${text.prompt}`)
    }
    if (!ISOLATED[task]) {
      return claudeText(
        claudeOptions(thread.accountId, cwd),
        model,
        text.instructions,
        text.prompt
      )
    }
    const directory = await mkdtemp(path.join(tmpdir(), 'offsite-title-'))
    try {
      const options = claudeOptions(thread.accountId, directory)
      return await claudeText(
        {
          ...options,
          env:
            task === 'session-title'
              ? { ...options.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1' }
              : options.env,
          strictMcpConfig: true,
          settings: { disableAllHooks: true },
          abortController,
        },
        model,
        text.instructions,
        text.prompt
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  const generation = {
    task,
    provider: thread.provider,
    account: thread.accountId,
    model,
    instructions: text.instructions,
    input: text.prompt,
    createdAt: Date.now(),
    ...generationLinks(cwd, text.link),
  }
  let output
  try {
    output = await reply(model)
  } catch (error) {
    db.insert(generations)
      .values({
        ...generation,
        output: null,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - generation.createdAt,
      })
      .run()
    throw error
  }
  db.insert(generations)
    .values({
      ...generation,
      output,
      status: 'succeeded',
      error: null,
      durationMs: Date.now() - generation.createdAt,
    })
    .run()
  return output
}

async function claudeText(
  options: Options,
  model: string,
  instructions: string,
  prompt: string
) {
  const conversation = query({
    prompt,
    options: {
      ...options,
      systemPrompt: instructions,
      tools: [],
      model,
      maxTurns: 1,
      persistSession: false,
    },
  })
  for await (const message of conversation) {
    if (message.type !== 'result') {
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
