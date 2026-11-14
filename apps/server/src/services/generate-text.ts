import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type Options, query } from '@anthropic-ai/claude-agent-sdk'
import { claudeOptions } from '../lib/claude/index.ts'
import { codexText } from '../lib/codex/index.ts'
import { openCodeText } from '../lib/opencode/index.ts'
import { readConfig } from '../storage/config.ts'
import { db } from '../storage/db.ts'
import { generations } from '../storage/schema.ts'
import { assertEnabled } from './accounts.ts'

const ISOLATED = {
  'session-title': true,
  'branch-name': true,
  'notice-summary': true,
  'review-guide': true,
  'pull-request': false,
  'commit-message': false,
} satisfies Record<(typeof generations.$inferSelect)['task'], boolean>

export async function generateText(
  task: keyof typeof ISOLATED,
  cwd: string,
  instructions: string,
  prompt: string,
  abortController?: AbortController
) {
  const { provider, accountId, model } = readConfig().smallModel
  if (provider === null || model === null) {
    throw new Error('Choose a small model in Settings → General')
  }
  assertEnabled(provider, accountId)
  async function reply(model: string) {
    if (provider === 'codex') {
      return codexText(accountId, cwd, model, instructions, prompt)
    }
    if (provider === 'opencode') {
      return openCodeText(cwd, model, `${instructions}\n\n${prompt}`)
    }
    if (!ISOLATED[task]) {
      return claudeText(
        claudeOptions(accountId, cwd),
        model,
        instructions,
        prompt
      )
    }
    const directory = await mkdtemp(path.join(tmpdir(), 'offsite-title-'))
    try {
      return await claudeText(
        {
          ...claudeOptions(accountId, directory),
          strictMcpConfig: true,
          settings: { disableAllHooks: true },
          abortController,
        },
        model,
        instructions,
        prompt
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
  const generation = {
    task,
    provider,
    account: accountId,
    model,
    instructions,
    input: prompt,
    createdAt: Date.now(),
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
