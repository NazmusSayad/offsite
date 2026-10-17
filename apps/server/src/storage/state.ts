import path from 'node:path'
import type { Composer } from '@offsite/core/protocol'
import { z } from 'zod'
import { broadcast } from '../lib/hub.ts'
import { home, readJson, writeJson } from './storage.ts'

const stateFile = path.join(home, 'state.json')

const stateSchema: z.ZodType<{ composer: Composer }> = z.strictObject({
  composer: z
    .strictObject({
      provider: z.enum(['claude', 'codex', 'opencode']).default('claude'),
      claude: z
        .strictObject({
          accountId: z.string().nullable().default(null),
          model: z.string().nullable().default(null),
          effort: z
            .enum(['low', 'medium', 'high', 'xhigh', 'max'])
            .nullable()
            .default(null),
          mode: z
            .enum([
              'default',
              'acceptEdits',
              'bypassPermissions',
              'plan',
              'dontAsk',
              'auto',
            ])
            .nullable()
            .default('bypassPermissions'),
          plan: z.boolean().default(false),
        })
        .prefault({}),
      codex: z
        .strictObject({
          accountId: z.string().nullable().default(null),
          model: z.string().nullable().default(null),
          effort: z.string().nullable().default(null),
          mode: z
            .enum(['read-only', 'auto', 'full-access'])
            .nullable()
            .default('auto'),
          plan: z.boolean().default(false),
        })
        .prefault({}),
      opencode: z
        .strictObject({
          accountId: z.null().default(null),
          model: z.string().nullable().default(null),
          effort: z.string().nullable().default(null),
          mode: z.string().nullable().default(null),
          plan: z.boolean().default(false),
        })
        .prefault({}),
    })
    .prefault({}),
})

const defaults = stateSchema.parse({})

export function readComposer() {
  let user: unknown
  try {
    user = readJson('state.json')
  } catch (error) {
    console.warn(`invalid ${stateFile}, using the default state: ${error}`)
    return structuredClone(defaults.composer)
  }
  if (user === null) {return structuredClone(defaults.composer)}
  const result = stateSchema.safeParse(user)
  if (!result.success) {
    console.warn(
      `invalid ${stateFile}, using the default state:\n${z.prettifyError(result.error)}`
    )
    return structuredClone(defaults.composer)
  }
  return result.data.composer
}

export function saveComposer(value: unknown) {
  const result = stateSchema.safeParse({ composer: value })
  if (!result.success) {throw new Error(z.prettifyError(result.error))}
  writeJson('state.json', result.data)
  broadcast({ type: 'composer', composer: result.data.composer })
  return result.data.composer
}
