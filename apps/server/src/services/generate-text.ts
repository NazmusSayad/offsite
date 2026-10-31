import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type Options, query } from '@anthropic-ai/claude-agent-sdk'
import { claudeOptions } from '../lib/claude/index.ts'
import { codexText } from '../lib/codex/index.ts'
import { openCodeText } from '../lib/opencode/index.ts'
import { readConfig } from '../storage/config.ts'
import { assertEnabled } from './accounts.ts'

export async function generateText(
  setting: 'commitMessage' | 'titleGeneration',
  cwd: string,
  instructions: string,
  prompt: string
) {
  const settings = readConfig()[setting]
  const provider = settings.provider
  const accountId = settings.accountId
  const model = settings.model
  if (provider === null || model === null) {
    throw new Error(
      setting === 'commitMessage'
        ? 'Choose a model in Settings → Git'
        : 'Choose a model in Settings → Session titles'
    )
  }
  assertEnabled(provider, accountId)
  if (provider === 'codex') {
    return codexText(accountId, cwd, model, instructions, prompt)
  }
  if (provider === 'opencode') {
    return openCodeText(cwd, model, `${instructions}\n\n${prompt}`)
  }
  if (setting === 'commitMessage') {
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
      },
      model,
      instructions,
      prompt
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
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
