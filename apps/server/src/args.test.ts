import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const argv = process.argv
let folder: string

beforeEach(() => {
  folder = mkdtempSync(path.join(tmpdir(), 'offsite-args-'))
  vi.resetModules()
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`exit ${code}`)
  })
})

afterEach(() => {
  process.argv = argv
  vi.restoreAllMocks()
  rmSync(folder, { recursive: true, force: true })
})

async function parse(...given: string[]) {
  process.argv = ['node', 'main.ts', ...given, '--dir', folder]
  return (await import('./args.ts')).args
}

function written() {
  return vi
    .mocked(process.stderr.write)
    .mock.calls.map((call) => String(call[0]))
    .join('')
}

describe('offsite connect add', () => {
  it('reads the address and code from a pairing link', async () => {
    const args = await parse(
      'connect',
      'add',
      'http://127.0.0.1:2020/pair#machine=https%3A%2F%2Fwindows.example%3A2020&code=secret'
    )

    expect(args.command).toBe('connect-add')
    expect(args.connection).toEqual({
      address: 'https://windows.example:2020',
      code: 'secret',
      addresses: ['https://windows.example:2020'],
      name: null,
    })
  })

  it('adds the --address addresses before the link address', async () => {
    const args = await parse(
      'connect',
      'add',
      'https://os-win.sayad.cc/pair#machine=https%3A%2F%2Fos-win.sayad.cc&code=secret',
      '--address',
      'https://192.168.0.102:20202/,https://os-win.sayad.cc'
    )

    expect(args.connection?.addresses).toEqual([
      'https://192.168.0.102:20202',
      'https://os-win.sayad.cc',
    ])
  })

  it('reads the name browsers show for it', async () => {
    const args = await parse(
      'connect',
      'add',
      'https://os-win.sayad.cc/pair#machine=https%3A%2F%2Fos-win.sayad.cc&code=secret',
      '--name',
      'Windows'
    )

    expect(args.connection?.name).toBe('Windows')
  })

  it('refuses an --address without http:// or https://', async () => {
    await expect(
      parse(
        'connect',
        'add',
        'https://os-win.sayad.cc/pair#machine=https%3A%2F%2Fos-win.sayad.cc&code=secret',
        '--address',
        '192.168.0.102:20202'
      )
    ).rejects.toThrow('exit 1')

    expect(written()).toContain(
      'error: --address 192.168.0.102:20202 needs http:// or https://'
    )
  })

  it.each([
    ['a plain address', 'http://127.0.0.1:2020'],
    [
      'a link without a code',
      'http://127.0.0.1:2020/pair#machine=http%3A%2F%2F127.0.0.1%3A2020',
    ],
    ['a link without a machine', 'http://127.0.0.1:2020/pair#code=secret'],
    ['text that is not a link', 'secret'],
  ])('refuses %s', async (_, link) => {
    await expect(parse('connect', 'add', link)).rejects.toThrow('exit 1')

    expect(written()).toContain(
      'error: use the pairing link from offsite pair on the other machine'
    )
  })
})

describe('offsite connect remove', () => {
  it('is its own command', async () => {
    expect((await parse('connect', 'remove')).command).toBe('connect-remove')
  })
})

describe('--connect', () => {
  it('passes --connect-name on to the service', async () => {
    const args = await parse(
      '--no-auth',
      '--connect',
      'https://of.sayad.cc',
      '--connect-name',
      'Mac'
    )

    expect(args.connectName).toBe('Mac')
    expect(args.serverArguments).toEqual(
      expect.arrayContaining(['--connect-name', 'Mac'])
    )
  })

  it('needs --connect for --connect-name', async () => {
    await expect(parse('--no-auth', '--connect-name', 'Mac')).rejects.toThrow(
      'exit 1'
    )

    expect(written()).toContain('error: --connect-name needs --connect')
  })

  it('needs --no-auth', async () => {
    await expect(parse('--connect', 'http://127.0.0.1:8001')).rejects.toThrow(
      'exit 1'
    )

    expect(written()).toContain('error: --connect needs --no-auth')
  })

  it('keeps the origin of each address', async () => {
    const args = await parse(
      '--no-auth',
      '--connect',
      'http://127.0.0.1:8001/,https://mac.example/path'
    )

    expect(args.connect).toEqual([
      'http://127.0.0.1:8001',
      'https://mac.example',
    ])
  })
})
