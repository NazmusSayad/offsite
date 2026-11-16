import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { consola } from 'consola'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const fake = await vi.hoisted(async () => {
  const fs = await import('node:fs')
  const os = await import('node:os')
  const { join } = await import('node:path')
  const root = fs.realpathSync(
    fs.mkdtempSync(join(os.tmpdir(), 'offsite-connections-'))
  )
  return {
    root,
    args: {
      dir: root,
      service: false,
      serverArguments: [],
      auth: false,
      connect: null as string[] | null,
      connectName: null as string | null,
    },
  }
})

vi.mock('../args.ts', () => ({
  args: fake.args,
  serverDir: path.join(import.meta.dirname, '..', '..'),
  version: 'test',
}))

const fs = await import('node:fs')
const storage = await import('../storage/connections.ts')
const auth = await import('../storage/auth.ts')
const connections = await import('./connections.ts')

let machine: Server
let machineAddress: string

beforeAll(async () => {
  machine = createServer((request, response) => {
    if (request.url !== '/api/pair' || request.method !== 'POST') {
      response.statusCode = 404
      response.end('not found')
      return
    }
    if (request.headers.authorization !== 'Bearer good-code') {
      response.statusCode = 401
      response.end('That pairing code expired or was already used')
      return
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ token: 'key-from-the-machine' }))
  })
  machine.listen(0, '127.0.0.1')
  await once(machine, 'listening')
  machineAddress = `http://127.0.0.1:${(machine.address() as AddressInfo).port}`
})

afterAll(() => {
  machine.close()
  fs.rmSync(fake.root, { recursive: true, force: true })
})

beforeEach(() => {
  fake.args.auth = false
  fake.args.connect = null
  fake.args.connectName = null
  for (const connection of storage.readConnections()) {
    storage.removeConnection(connection.address)
  }
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Error(`exit ${code}`)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

function saved() {
  return storage.readConnections().map((item) => ({
    address: item.address,
    addresses: item.addresses,
    name: item.name,
    key: item.key,
  }))
}

function setTerminal(isTTY: boolean) {
  Object.defineProperty(process.stdin, 'isTTY', {
    value: isTTY,
    configurable: true,
  })
}

describe('offsite connect add', () => {
  it('pairs with the other machine and saves the key it gives', async () => {
    await connections.addConnection({
      address: machineAddress,
      code: 'good-code',
      addresses: ['https://192.168.0.102:20202', machineAddress],
      name: 'Windows',
    })

    expect(saved()).toEqual([
      {
        address: machineAddress,
        addresses: ['https://192.168.0.102:20202', machineAddress],
        name: 'Windows',
        key: 'key-from-the-machine',
      },
    ])
    expect(console.log).toHaveBeenCalledWith(
      `Connected to ${machineAddress}; browsers reach it at https://192.168.0.102:20202, ${machineAddress} the next time they open this machine's web app`
    )
  })

  it('replaces the key when the same machine is added again', async () => {
    storage.saveConnection(machineAddress, [machineAddress], null, 'older-key')

    await connections.addConnection({
      address: machineAddress,
      code: 'good-code',
      addresses: [machineAddress],
      name: null,
    })

    expect(saved()).toEqual([
      {
        address: machineAddress,
        addresses: [machineAddress],
        name: null,
        key: 'key-from-the-machine',
      },
    ])
  })

  it('stops with the reason when the other machine refuses the code', async () => {
    await expect(
      connections.addConnection({
        address: machineAddress,
        code: 'used-code',
        addresses: [machineAddress],
        name: null,
      })
    ).rejects.toThrow('exit 1')

    expect(console.error).toHaveBeenCalledWith(
      `${machineAddress} did not connect: That pairing code expired or was already used`
    )
    expect(saved()).toEqual([])
  })

  it('stops when the other machine cannot be reached', async () => {
    await expect(
      connections.addConnection({
        address: 'http://127.0.0.1:1',
        code: 'good-code',
        addresses: ['http://127.0.0.1:1'],
        name: null,
      })
    ).rejects.toThrow('exit 1')

    expect(vi.mocked(console.error).mock.calls[0][0]).toMatch(
      /^Could not reach http:\/\/127\.0\.0\.1:1: /
    )
    expect(saved()).toEqual([])
  })
})

describe('offsite connect remove', () => {
  it('deletes only the picked machines, and only on this machine', async () => {
    storage.saveConnection(
      'http://windows.local:2020',
      ['http://windows.local:2020'],
      null,
      'windows-key'
    )
    storage.saveConnection(
      'http://wsl.local:2020',
      ['http://wsl.local:2020'],
      null,
      'wsl-key'
    )
    setTerminal(true)
    vi.spyOn(consola, 'prompt').mockResolvedValue([
      'http://windows.local:2020',
    ] as never)
    const request = vi.spyOn(globalThis, 'fetch')

    await connections.removeConnections()

    expect(saved()).toEqual([
      {
        address: 'http://wsl.local:2020',
        addresses: ['http://wsl.local:2020'],
        name: null,
        key: 'wsl-key',
      },
    ])
    expect(request).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      'Removed http://windows.local:2020'
    )
  })

  it('removes nothing when nothing is picked', async () => {
    storage.saveConnection(
      'http://windows.local:2020',
      ['http://windows.local:2020'],
      null,
      'windows-key'
    )
    setTerminal(true)
    vi.spyOn(consola, 'prompt').mockResolvedValue(null as never)

    await connections.removeConnections()

    expect(saved()).toHaveLength(1)
    expect(console.log).toHaveBeenCalledWith('Nothing removed')
  })

  it('says so when no machines are connected', async () => {
    const prompt = vi.spyOn(consola, 'prompt')

    await connections.removeConnections()

    expect(prompt).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith('No machines are connected')
  })

  it('needs a terminal to pick from', async () => {
    storage.saveConnection(
      'http://windows.local:2020',
      ['http://windows.local:2020'],
      null,
      'windows-key'
    )
    setTerminal(false)

    await expect(connections.removeConnections()).rejects.toThrow('exit 1')

    expect(console.error).toHaveBeenCalledWith(
      'offsite connect remove needs an interactive terminal'
    )
    expect(saved()).toHaveLength(1)
  })
})

describe('the list of machines for the web app', () => {
  it('lists every connected machine with the key this machine got for it', () => {
    storage.saveConnection(
      'http://windows.local:2020',
      ['http://windows.local:2020'],
      null,
      'windows-key'
    )
    storage.saveConnection(
      'http://wsl.local:2020',
      ['http://wsl.local:2020'],
      null,
      'wsl-key'
    )

    expect(connections.listMachines(null)).toEqual([
      {
        id: 'http://windows.local:2020',
        addresses: ['http://windows.local:2020'],
        name: null,
        key: 'windows-key',
      },
      {
        id: 'http://wsl.local:2020',
        addresses: ['http://wsl.local:2020'],
        name: null,
        key: 'wsl-key',
      },
    ])
  })

  it('gives browsers every address of a connected machine', () => {
    storage.saveConnection(
      'https://os-win.sayad.cc',
      ['https://192.168.0.102:20202', 'https://os-win.sayad.cc'],
      null,
      'windows-key'
    )

    expect(connections.listMachines(null)).toEqual([
      {
        id: 'https://os-win.sayad.cc',
        addresses: ['https://192.168.0.102:20202', 'https://os-win.sayad.cc'],
        name: null,
        key: 'windows-key',
      },
    ])
  })

  it('puts the --connect addresses first, without a key', () => {
    fake.args.connect = ['http://127.0.0.1:8001', 'https://mac.example']
    storage.saveConnection(
      'http://windows.local:2020',
      ['http://windows.local:2020'],
      null,
      'windows-key'
    )

    expect(connections.listMachines(null)).toEqual([
      {
        id: 'host',
        addresses: ['http://127.0.0.1:8001', 'https://mac.example'],
        name: null,
        key: null,
      },
      {
        id: 'http://windows.local:2020',
        addresses: ['http://windows.local:2020'],
        name: null,
        key: 'windows-key',
      },
    ])
  })

  it('gives the names set with --connect-name and connect add --name', () => {
    fake.args.connect = ['https://of.sayad.cc']
    fake.args.connectName = 'Mac'
    storage.saveConnection(
      'https://os-win.sayad.cc',
      ['https://os-win.sayad.cc'],
      'Windows',
      'windows-key'
    )

    expect(
      connections.listMachines(null)?.map((machine) => machine.name)
    ).toEqual(['Mac', 'Windows'])
  })

  it('is empty when nothing is connected', () => {
    expect(connections.listMachines(null)).toEqual([])
  })

  it('needs a paired browser when pairing is on', () => {
    fake.args.auth = true
    storage.saveConnection(
      'http://windows.local:2020',
      ['http://windows.local:2020'],
      null,
      'windows-key'
    )
    const token = auth.redeemCode(auth.addCode('phone'))

    expect(connections.listMachines(null)).toBe(null)
    expect(connections.listMachines('unknown')).toBe(null)
    expect(connections.listMachines(token)).toEqual([
      {
        id: 'http://windows.local:2020',
        addresses: ['http://windows.local:2020'],
        name: null,
        key: 'windows-key',
      },
    ])
  })
})
