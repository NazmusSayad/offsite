import { type AppIconId, appIcons } from '@offsite/core/app-icons'
import { z } from 'zod'
import { broadcast } from '../lib/hub.ts'
import { readSettings, writeJson } from './storage.ts'

const stateSchema: z.ZodType<{ appIcon: AppIconId }> = z.strictObject({
  appIcon: z
    .custom<AppIconId>((value) => appIcons.some((icon) => icon.id === value))
    .default('original'),
})

const defaults = stateSchema.parse({})

function readState() {
  return readSettings('state.json', stateSchema, defaults)
}

export function readAppIcon() {
  return readState().appIcon
}

export function saveAppIcon(value: unknown) {
  const result = stateSchema.safeParse({ ...readState(), appIcon: value })
  if (!result.success) {
    throw new Error(z.prettifyError(result.error))
  }
  writeJson('state.json', result.data)
  broadcast({ type: 'appIcon', appIcon: result.data.appIcon })
  return result.data.appIcon
}
