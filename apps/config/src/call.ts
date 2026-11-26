import type { UpdateCall, UpdateOptions } from './types.ts'

export type RecordedCall<Meta> = UpdateCall<Meta> & {
  method: 'put' | 'patch'
}

export function updateCall<Meta>(
  method: 'put' | 'patch',
  options: UpdateOptions<Meta>
): RecordedCall<Meta> {
  return {
    method,
    options: {
      layer: options.layer,
      force: options.force,
      prefer: options.prefer,
    },
    meta: options.meta,
  }
}
