import { schemes } from '@offsite/core/schemes'
import { z } from 'zod'

const prefsSchema = z.strictObject({
  theme: z
    .string()
    .refine((id) => schemes.some((scheme) => scheme.id === id))
    .default(schemes[0].id),
  terminal: z
    .strictObject({
      font: z
        .strictObject({
          family: z.string().default('FiraCode Nerd Font'),
          size: z.number().default(14),
          lineHeight: z.number().default(1.35),
          ligatures: z.boolean().default(true),
        })
        .prefault({}),
      cursor: z
        .strictObject({
          style: z.enum(['block', 'bar', 'underline']).default('bar'),
          blink: z.boolean().default(true),
        })
        .prefault({}),
      padding: z
        .strictObject({
          top: z.number().default(4),
          right: z.number().default(4),
          bottom: z.number().default(0),
          left: z.number().default(4),
        })
        .prefault({}),
      scrollback: z.number().default(1000),
      boldIsBright: z.boolean().default(true),
      behavior: z
        .strictObject({
          modernizeShiftEnter: z.boolean().default(true),
          pasteBrowserImages: z.boolean().default(true),
          captureShortcuts: z.boolean().default(true),
          bellFlash: z.boolean().default(true),
          bellSound: z.boolean().default(true),
          clickToMoveCursor: z.boolean().default(true),
          optionAsMeta: z.enum(['off', 'left', 'right', 'both']).default('off'),
          confirmCloseBusyTab: z.boolean().default(true),
        })
        .prefault({}),
    })
    .prefault({}),
  editor: z
    .strictObject({
      font: z
        .strictObject({
          family: z
            .string()
            .default(
              "ui-monospace, 'SF Mono', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace"
            ),
          size: z.number().default(13),
          lineHeight: z.number().default(1.5),
          ligatures: z.boolean().default(false),
        })
        .prefault({}),
      cursor: z
        .strictObject({
          style: z.enum(['block', 'bar', 'underline']).default('bar'),
          blink: z.boolean().default(true),
        })
        .prefault({}),
      wordWrap: z.boolean().default(false),
    })
    .prefault({}),
  diff: z
    .strictObject({
      split: z.boolean().default(false),
      wrap: z.boolean().default(true),
      collapsed: z.boolean().default(false),
    })
    .prefault({}),
  rewind: z.enum(['all', 'chat', 'code']).default('chat'),
})

export type Prefs = z.infer<typeof prefsSchema>

export type TerminalPrefs = Prefs['terminal']

export type EditorPrefs = Prefs['editor']

export type RewindMode = Prefs['rewind']

const storageKey = 'prefs'

export const defaultPrefs = prefsSchema.parse({})

export function loadPrefs(): Prefs {
  const raw = localStorage.getItem(storageKey)
  if (raw === null) {
    return structuredClone(defaultPrefs)
  }
  const result = prefsSchema.safeParse(JSON.parse(raw))
  if (!result.success) {
    console.warn(
      `invalid stored prefs, using the defaults:\n${z.prettifyError(result.error)}`
    )
    return structuredClone(defaultPrefs)
  }
  return result.data
}

export function savePrefs(prefs: Prefs) {
  localStorage.setItem(storageKey, JSON.stringify(prefs))
}
