import { describe, expect, it } from 'vitest'
import { updateCall } from './call.ts'

describe('updateCall', () => {
  it('keeps the method, the options and the meta apart', () => {
    expect(
      updateCall('patch', {
        layer: 'local',
        force: true,
        prefer: 'last',
        meta: { source: 'file' },
      })
    ).toEqual({
      method: 'patch',
      options: { layer: 'local', force: true, prefer: 'last' },
      meta: { source: 'file' },
    })
  })

  it('leaves out what was not given', () => {
    expect(updateCall('put', {})).toEqual({
      method: 'put',
      options: { layer: undefined, force: undefined, prefer: undefined },
      meta: undefined,
    })
  })
})
