import { describe, expect, it } from 'vitest'
import { createMachineConfig } from './machine-config.ts'

function dropped(value: unknown) {
  return createMachineConfig([{ key: 'config.json', value }]).dropped.map(
    (item) => item.path.join('.')
  )
}

describe('createMachineConfig', () => {
  it('uses the defaults when no file sets anything', () => {
    const config = createMachineConfig([])
    expect(config.value.version).toBe(4)
    expect(config.value.autoTitle).toBe(true)
    expect(config.value.delivery).toBe('steer')
    expect(config.value.claude.accounts).toEqual([])
  })

  it('lets config.local.json override config.json', () => {
    const config = createMachineConfig([
      { key: 'config.json', value: { version: 4, autoTitle: false } },
      { key: 'config.local.json', value: { autoTitle: true } },
    ])
    expect(config.value.autoTitle).toBe(true)
  })

  it.each(['/Users/me/.claude', '/'])(
    'accepts the absolute macOS and Linux path %s',
    (dir) => {
      expect(
        dropped({ claude: { baseDir: { macos: dir, linux: dir } } })
      ).toEqual([])
    }
  )

  it.each(['relative/dir', '~/claude', 'C:\\claude'])(
    'ignores the macOS path %s',
    (dir) => {
      expect(dropped({ claude: { baseDir: { macos: dir } } })).toEqual([
        'claude.baseDir.macos',
      ])
    }
  )

  it.each(['C:\\Users\\me', 'c:/Users/me', '\\\\server\\share', '/root'])(
    'accepts the absolute Windows path %s',
    (dir) => {
      expect(dropped({ claude: { baseDir: { windows: dir } } })).toEqual([])
    }
  )

  it.each(['C:relative', 'relative\\dir', 'Users'])(
    'ignores the Windows path %s',
    (dir) => {
      expect(dropped({ claude: { baseDir: { windows: dir } } })).toEqual([
        'claude.baseDir.windows',
      ])
    }
  )

  it.each(['~', '~/code', '/code'])('accepts the working folder %s', (dir) => {
    expect(dropped({ workingDir: { macos: dir } })).toEqual([])
  })

  it('ignores a working folder that is neither absolute nor under ~', () => {
    expect(dropped({ workingDir: { macos: 'code' } })).toEqual([
      'workingDir.macos',
    ])
  })

  it('ignores an account color that is not a hex color', () => {
    const config = createMachineConfig([
      {
        key: 'config.json',
        value: {
          claude: {
            accounts: [
              { id: 'a', provider: 'claude', name: 'A', color: 'red' },
              { id: 'b', provider: 'claude', name: 'B', color: '#3b82f6' },
            ],
          },
        },
      },
    ])
    expect(config.value.claude.accounts.map((item) => item.color)).toEqual([
      null,
      '#3b82f6',
    ])
  })
})
