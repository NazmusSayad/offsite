import type { Project } from '@offsite/core/projects'
import type { ListedMachine } from '@offsite/core/protocol'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAppStore,
  getState,
  type Machine,
  setMachine,
  type State,
  update,
} from '@/lib/store'
import { connectMachine, disconnectMachine } from './connection'
import {
  loadMachines,
  restoreMachine,
  restoreProjects,
  type StoredMachine,
  syncListedMachines,
} from './machines'

const tokens = vi.hoisted(() => new Map<string, string>())

vi.mock('@/lib/tokens', () => ({
  readToken: async (machine: string) => tokens.get(machine),
  saveToken: async (machine: string, token: string) => {
    tokens.set(machine, token)
  },
  removeToken: async (machine: string) => {
    tokens.delete(machine)
  },
}))
vi.mock('@/lib/router', () => ({ router: { navigate: vi.fn() } }))
vi.mock('@/lib/url', () => ({ syncUrl: vi.fn() }))
vi.mock('./connection', () => ({
  connectMachine: vi.fn(),
  disconnectMachine: vi.fn(),
}))

const WINDOWS = 'http://windows.local:2020'
const WSL = 'http://wsl.local:2020'

function project(id: string, extra: object): Project {
  return {
    id,
    path: `/${id}`,
    name: id,
    logo: null,
    pinned: false,
    hidden: false,
    scratch: false,
    worktreeSetup: null,
    startInWorktree: false,
    score: 0,
    ...extra,
  }
}

function stored(
  id: string,
  addresses: string[],
  listId: string | null
): StoredMachine {
  return {
    id,
    addresses,
    name: id,
    icon: null,
    label: null,
    pairedAt: null,
    listId,
    listName: null,
    listAddresses: listId === null ? [] : addresses,
    projects: [],
  }
}

function have(...machines: StoredMachine[]) {
  update({ machines: machines.map(restoreMachine) })
}

function answer(list: ListedMachine[]) {
  vi.mocked(fetch).mockResolvedValue(Response.json(list))
}

function machines() {
  return getState().machines.map((machine: Machine) => ({
    addresses: machine.addresses,
    listId: machine.listId,
    token: tokens.get(machine.id) ?? null,
  }))
}

function machineAt(address: string) {
  const found = getState().machines.find((machine) =>
    machine.addresses.includes(address)
  )
  if (found === undefined) {
    throw new Error(`no machine at ${address}`)
  }
  return found
}

beforeEach(() => {
  tokens.clear()
  localStorage.clear()
  vi.mocked(connectMachine).mockClear()
  vi.mocked(disconnectMachine).mockClear()
  vi.stubGlobal('fetch', vi.fn())
  createAppStore({
    machines: [],
    projects: [],
    sessions: [],
    inactive: [],
    settingsMachine: null,
    selection: null,
  } as unknown as State)
})

describe('restoreProjects', () => {
  it('drops worktrees cached as projects by an older version', () => {
    const machine: StoredMachine = {
      ...stored('machine', [], null),
      projects: [
        project('current', {}),
        project('old-root', { parentId: null, worktreeBranch: null }),
        project('old-worktree', { parentId: 'old-root', worktreeBranch: 'b' }),
      ],
    }

    expect(restoreProjects(machine).map((item) => item.id)).toEqual([
      'current',
      'old-root',
    ])
  })
})

describe('syncListedMachines', () => {
  it('adds every listed machine with its key and connects to it', async () => {
    answer([
      {
        id: 'host',
        addresses: ['http://127.0.0.1:8001'],
        name: null,
        key: null,
      },
      { id: WINDOWS, addresses: [WINDOWS], name: null, key: 'windows-key' },
    ])

    await syncListedMachines()

    expect(machines()).toEqual([
      { addresses: ['http://127.0.0.1:8001'], listId: 'host', token: null },
      { addresses: [WINDOWS], listId: WINDOWS, token: 'windows-key' },
    ])
    expect(machineAt('http://127.0.0.1:8001').pairedAt).toBe(null)
    expect(machineAt(WINDOWS).pairedAt).not.toBe(null)
    expect(connectMachine).toHaveBeenCalledWith(machineAt(WINDOWS).id, [
      WINDOWS,
    ])
    expect(loadMachines().map((machine) => machine.listId)).toEqual([
      'host',
      WINDOWS,
    ])
  })

  it("asks the page's own server with this browser's key for it", async () => {
    have(stored('page', [location.origin], null))
    tokens.set('page', 'page-key')
    answer([])

    await syncListedMachines()

    expect(fetch).toHaveBeenCalledWith('/api/machines', {
      method: 'POST',
      headers: { authorization: 'Bearer page-key' },
    })
  })

  it('asks without a key when this browser has none for the page', async () => {
    answer([])

    await syncListedMachines()

    expect(fetch).toHaveBeenCalledWith('/api/machines', {
      method: 'POST',
      headers: {},
    })
  })

  it('takes over a machine it already has at the same address', async () => {
    have(stored('mine', [WINDOWS], null))
    tokens.set('mine', 'old-key')
    setMachine('mine', { status: 'unpaired' })
    answer([
      { id: WINDOWS, addresses: [WINDOWS], name: null, key: 'windows-key' },
    ])

    await syncListedMachines()

    expect(machines()).toEqual([
      { addresses: [WINDOWS], listId: WINDOWS, token: 'windows-key' },
    ])
    expect(machineAt(WINDOWS).id).toBe('mine')
    expect(disconnectMachine).toHaveBeenCalledWith('mine')
    expect(connectMachine).toHaveBeenCalledWith('mine', [WINDOWS])
  })

  it('saves a new key without reconnecting a machine that is connected', async () => {
    have(stored('mine', [WINDOWS], WINDOWS))
    setMachine('mine', { status: 'online' })
    answer([{ id: WINDOWS, addresses: [WINDOWS], name: null, key: 'new-key' }])

    await syncListedMachines()

    expect(tokens.get('mine')).toBe('new-key')
    expect(connectMachine).not.toHaveBeenCalled()
  })

  it('adds new addresses from the list after the ones it has', async () => {
    have(stored('mac', ['http://127.0.0.1:8001'], 'host'))
    answer([
      {
        id: 'host',
        addresses: ['https://mac.example', 'http://127.0.0.1:8001'],
        name: null,
        key: null,
      },
    ])

    await syncListedMachines()

    expect(machineAt('https://mac.example').addresses).toEqual([
      'http://127.0.0.1:8001',
      'https://mac.example',
    ])
    expect(machineAt('https://mac.example').listAddresses).toEqual([
      'https://mac.example',
      'http://127.0.0.1:8001',
    ])
    expect(connectMachine).toHaveBeenCalledWith('mac', [
      'http://127.0.0.1:8001',
      'https://mac.example',
    ])
  })

  it('keeps addresses added in this browser and the order set here', async () => {
    have({
      ...stored('windows', ['http://10.0.0.5:2020', WINDOWS], WINDOWS),
      listAddresses: [WINDOWS],
    })
    answer([
      {
        id: WINDOWS,
        addresses: [WINDOWS, 'https://192.168.0.102:20202'],
        name: null,
        key: null,
      },
    ])

    await syncListedMachines()

    expect(machineAt(WINDOWS).addresses).toEqual([
      'http://10.0.0.5:2020',
      WINDOWS,
      'https://192.168.0.102:20202',
    ])
    expect(loadMachines()[0].listAddresses).toEqual([
      WINDOWS,
      'https://192.168.0.102:20202',
    ])
  })

  it('drops list addresses the list no longer gives', async () => {
    have({
      ...stored(
        'windows',
        ['https://192.168.0.102:20202', 'http://10.0.0.5:2020', WINDOWS],
        WINDOWS
      ),
      listAddresses: [WINDOWS, 'https://192.168.0.102:20202'],
    })
    setMachine('windows', { status: 'online' })
    answer([{ id: WINDOWS, addresses: [WINDOWS], name: null, key: null }])

    await syncListedMachines()

    expect(machineAt(WINDOWS).addresses).toEqual([
      'http://10.0.0.5:2020',
      WINDOWS,
    ])
    expect(connectMachine).toHaveBeenCalledWith('windows', [
      'http://10.0.0.5:2020',
      WINDOWS,
    ])
  })

  it('keeps the addresses of a machine it takes over', async () => {
    have(stored('mine', [WINDOWS], null))
    answer([
      {
        id: WINDOWS,
        addresses: ['https://192.168.0.102:20202', WINDOWS],
        name: null,
        key: null,
      },
    ])

    await syncListedMachines()

    expect(machineAt(WINDOWS).addresses).toEqual([
      WINDOWS,
      'https://192.168.0.102:20202',
    ])
  })

  it('removes listed machines that left the list and keeps the others', async () => {
    have(
      stored('windows', [WINDOWS], WINDOWS),
      stored('wsl', [WSL], WSL),
      stored('mine', ['http://laptop.local:2020'], null)
    )
    tokens.set('windows', 'windows-key')
    tokens.set('wsl', 'wsl-key')
    tokens.set('mine', 'my-key')
    answer([{ id: WSL, addresses: [WSL], name: null, key: 'wsl-key' }])

    await syncListedMachines()

    expect(machines()).toEqual([
      { addresses: [WSL], listId: WSL, token: 'wsl-key' },
      {
        addresses: ['http://laptop.local:2020'],
        listId: null,
        token: 'my-key',
      },
    ])
    expect(disconnectMachine).toHaveBeenCalledWith('windows')
    expect(loadMachines().map((machine) => machine.id)).toEqual(['wsl', 'mine'])
  })

  it('shows the name from the list over the name set in this browser', async () => {
    have({ ...stored('mine', [WINDOWS], null), label: 'My PC' })
    answer([
      {
        id: WINDOWS,
        addresses: [WINDOWS],
        name: 'Windows',
        key: 'windows-key',
      },
      { id: WSL, addresses: [WSL], name: 'WSL', key: 'wsl-key' },
    ])

    await syncListedMachines()

    expect(
      getState().machines.map((machine) => [machine.name, machine.listName])
    ).toEqual([
      ['Windows', 'Windows'],
      ['WSL', 'WSL'],
    ])
    expect(loadMachines().map((machine) => machine.listName)).toEqual([
      'Windows',
      'WSL',
    ])
  })

  it("goes back to this browser's name when the list stops naming it", async () => {
    have({
      ...stored('mine', [WINDOWS], WINDOWS),
      label: 'My PC',
      listName: 'Windows',
    })
    answer([{ id: WINDOWS, addresses: [WINDOWS], name: null, key: null }])

    await syncListedMachines()

    expect(machineAt(WINDOWS).name).toBe('My PC')
    expect(machineAt(WINDOWS).listName).toBe(null)
  })

  it('treats machines saved by an older version as added by hand', async () => {
    const older: Partial<StoredMachine> = stored('old', [WINDOWS], null)
    delete older.listId
    delete older.listName
    delete older.listAddresses
    localStorage.setItem('machines', JSON.stringify([older]))
    have(...loadMachines())
    answer([])

    await syncListedMachines()

    expect(machines()).toEqual([
      { addresses: [WINDOWS], listId: null, token: null },
    ])
  })

  it.each([
    [
      'cannot be reached',
      () => vi.mocked(fetch).mockRejectedValue(new TypeError('offline')),
    ],
    [
      'refuses the browser',
      () =>
        vi
          .mocked(fetch)
          .mockResolvedValue(
            new Response('This browser needs pairing', { status: 401 })
          ),
    ],
  ])('keeps every machine when the server %s', async (_, fail) => {
    have(stored('windows', [WINDOWS], WINDOWS))
    tokens.set('windows', 'windows-key')
    fail()

    await syncListedMachines()

    expect(machines()).toEqual([
      { addresses: [WINDOWS], listId: WINDOWS, token: 'windows-key' },
    ])
    expect(disconnectMachine).not.toHaveBeenCalled()
  })
})
