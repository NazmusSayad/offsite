import { z } from 'zod'
import { LayeredConfig } from '../layered-config.ts'
import type { InputConfigLayer, InputConfigOptions } from '../types.ts'

export const schema = z.strictObject({
  name: z.string().default('app'),
  count: z.number().int().positive().default(1),
  mode: z.enum(['fast', 'slow']).default('fast'),
  tags: z.array(z.string()).default([]),
  note: z.string().nullable().default(null),
  nested: z
    .strictObject({
      on: z.boolean().default(true),
      level: z.number().default(0),
    })
    .prefault({}),
  records: z
    .record(z.string(), z.strictObject({ hidden: z.boolean() }))
    .default({}),
})

export type TestConfig = z.infer<typeof schema>

export type TestMeta = { source: string }

export function make(layers: InputConfigLayer[], options?: InputConfigOptions) {
  return new LayeredConfig<TestConfig, TestMeta>(schema, layers, options)
}
