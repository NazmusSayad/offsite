import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import type { IPty } from '@lydell/node-pty'
import {
  type BusyResult,
  decodeFrame,
  encodeFrame,
  FRAME_INPUT,
  FRAME_OUTPUT,
  FRAME_REPLAY,
  FRAME_REPLY,
  type TerminalEvent,
  type TerminalLayout,
  type TerminalRequest,
  type TerminalPlace,
  type TerminalTab,
  terminalViewOf,
} from '@offsite/core/terminal'
import { broadcast, type Client } from '../../lib/hub.ts'
import { logger } from '../../lib/log.ts'
import { workingDirectory } from '../../storage/config.ts'
import { type Place, placePath } from '../project-worktrees.ts'
import { Scanner } from './alerts.ts'
import { busyProgram, currentDirectory, startShell } from './process.ts'

const log = logger.withTag('terminal')

type Connection = {
  client: Client
  sizes: Map<
    number,
    { cols: number; rows: number; width: number; height: number }
  >
}

type Terminal = {
  pty: IPty
  history: Buffer[]
  historySize: number
  owner: Connection | null
  scanner: Scanner
}

const HISTORY_LIMIT = 2 * 1024 * 1024
const OUTPUT_LIMIT = 1024 * 1024
const STALL_LIMIT = 10_000
const KILL_DELAY = 3000

const instance = `${Date.now()}-${randomUUID()}`
const tabs: TerminalTab[] = []
const active = new Map<string, number>()
const terminals = new Map<number, Terminal>()
const connections = new Map<Client, Connection>()
const paused = new Set<IPty>()
const held = new Set<IPty>()
let nextTab = 0
let draining: NodeJS.Timeout | null = null

export async function terminalRequest(
  client: Client,
  message: TerminalRequest
) {
  if (message.type === 'attach') {
    attach(client)
    return
  }
  if (message.type === 'detach') {
    detachTerminal(client)
    return
  }
  if (message.type === 'resize') {
    const connection = connections.get(client)
    if (connection === undefined) {
      throw new Error('the terminal is not attached')
    }
    resize(connection, message)
    return
  }
  await request(message)
}

export function terminalInput(client: Client, frame: Buffer) {
  const connection = connections.get(client)
  if (connection === undefined) {
    log.warn('terminal input from a browser that is not attached')
    return
  }
  input(connection, frame)
}

export function detachTerminal(client: Client) {
  const connection = connections.get(client)
  if (connection === undefined) {
    return
  }
  connections.delete(client)
  for (const terminal of terminals.values()) {
    if (terminal.owner === connection) {
      terminal.owner = null
    }
  }
}

export async function busyTerminal(id: number): Promise<BusyResult> {
  const terminal = terminals.get(id)
  if (terminal === undefined) {
    return { program: null }
  }
  try {
    return { program: await busyProgram(terminal.pty.pid) }
  } catch (error) {
    log.warn(`could not tell if terminal ${id} is busy:`, error)
    return { error: String(error) }
  }
}

export function terminalTabs() {
  return tabs
}

function attach(client: Client) {
  detachTerminal(client)
  const connection: Connection = { client, sizes: new Map() }
  connections.set(client, connection)
  send(connection, {
    type: 'active',
    layout: layout(),
    instance,
  })
  for (const tab of tabs) {
    forward(
      connection,
      tab.id,
      true,
      Buffer.concat(terminals.get(tab.id)?.history ?? [])
    )
  }
  for (const pty of held) {
    pty.resume()
  }
  held.clear()
}

function resize(
  connection: Connection,
  message: Extract<TerminalRequest, { type: 'resize' }>
) {
  const terminal = terminals.get(message.id)
  if (terminal === undefined) {
    return
  }
  connection.sizes.set(message.id, {
    cols: message.cols,
    rows: message.rows,
    width: message.width,
    height: message.height,
  })
  terminal.owner = connection
  terminal.pty.resize(message.cols, message.rows, {
    width: message.width,
    height: message.height,
  })
}

async function request(
  message: Exclude<TerminalRequest, { type: 'attach' | 'detach' | 'resize' }>
) {
  switch (message.type) {
    case 'createTab':
      await createTab(message)
      break
    case 'closeTab':
      closeTab(message.id)
      break
    case 'renameTab': {
      const tab = findTab(message.id)
      if (tab === undefined) {
        return
      }
      tab.customName = message.name === '' ? null : message.name
      break
    }
    case 'assignTab': {
      const tab = findTab(message.id)
      if (
        tab === undefined ||
        (tab.projectId === message.projectId &&
          tab.worktreeId === message.worktreeId)
      ) {
        return
      }
      if (message.projectId !== null) {
        placePath(message.projectId, message.worktreeId)
      }
      release(tab)
      tab.projectId = message.projectId
      tab.worktreeId = message.worktreeId
      if (!active.has(terminalViewOf(tab))) {
        active.set(terminalViewOf(tab), tab.id)
      }
      break
    }
    case 'select': {
      const tab = viewTabs(message.view).find(
        (item) => item.id === message.tabId
      )
      if (tab !== undefined) {
        active.set(message.view, tab.id)
      }
      break
    }
  }
  publish()
}

function input(connection: Connection, bytes: Buffer) {
  let frame
  try {
    frame = decodeFrame(bytes)
  } catch (error) {
    log.warn(`ignoring terminal input:`, error)
    return
  }
  const terminal = terminals.get(frame.id)
  if (terminal === undefined) {
    log.warn(`input for terminal ${frame.id}, which does not exist`)
    return
  }
  if (frame.kind === FRAME_REPLY) {
    if (terminal.owner !== null && terminal.owner !== connection) {
      return
    }
  } else if (frame.kind === FRAME_INPUT) {
    const size = connection.sizes.get(frame.id)
    if (terminal.owner !== connection && size !== undefined) {
      terminal.owner = connection
      terminal.pty.resize(size.cols, size.rows, {
        width: size.width,
        height: size.height,
      })
    }
  } else {
    log.warn(`ignoring terminal input of unknown kind ${frame.kind}`)
    return
  }
  terminal.pty.write(Buffer.from(frame.data))
}

async function createTab(place: TerminalPlace) {
  const cwd =
    place.projectId === null
      ? workingDirectory()
      : placePath(place.projectId, place.worktreeId)
  if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
    log.error(`${cwd} is not a folder, terminal not created`)
    return
  }
  const activeId = active.get(terminalViewOf(place))
  const current = activeId === undefined ? undefined : terminals.get(activeId)
  let directory = cwd
  if (current !== undefined) {
    try {
      directory = await currentDirectory(
        current.pty.pid,
        current.scanner.directory
      )
    } catch (error) {
      log.warn(
        `starting in the project folder, could not read the folder of the active terminal:`,
        error
      )
    }
  }
  try {
    openTab(place, directory, null, {})
  } catch (error) {
    log.error(`could not start a terminal:`, error)
  }
}

export function startSetup(
  place: Place,
  command: string,
  environment: Record<string, string>
) {
  try {
    const pty = openTab(
      place,
      placePath(place.projectId, place.worktreeId),
      'Setup',
      environment
    )
    const started = pty.onData(() => {
      started.dispose()
      pty.write(`${command}\r`)
    })
    publish()
  } catch (error) {
    log.error(`could not start the setup terminal:`, error)
  }
}

export function closeWorktreeTerminals(worktreeId: string) {
  const ids = tabs
    .filter((tab) => tab.worktreeId === worktreeId)
    .map((tab) => tab.id)
  for (const id of ids) {
    closeTab(id)
  }
  if (ids.length > 0) {
    publish()
  }
}

function openTab(
  place: TerminalPlace,
  directory: string,
  customName: string | null,
  environment: Record<string, string>
) {
  nextTab += 1
  const id = nextTab
  const pty = startShell(directory, environment)
  const terminal: Terminal = {
    pty,
    history: [],
    historySize: 0,
    owner: null,
    scanner: new Scanner(),
  }
  log.info(`started terminal ${id} with pid ${pty.pid} in ${directory}`)
  terminals.set(id, terminal)
  tabs.push({
    id,
    projectId: place.projectId,
    worktreeId: place.worktreeId,
    customName,
  })
  active.set(terminalViewOf(place), id)
  pty.onData((data) => output(id, terminal, Buffer.from(data)))
  if (connections.size === 0) {
    pty.pause()
    held.add(pty)
  }
  pty.onExit((event) => {
    log.info(`terminal ${id} exited with code ${event.exitCode}`)
    terminals.delete(id)
    paused.delete(pty)
    held.delete(pty)
    if (closeTab(id)) {
      publish()
    }
  })
  return pty
}

function closeTab(id: number) {
  const tab = findTab(id)
  if (tab === undefined) {
    return false
  }
  log.debug(`closing terminal ${id}`)
  release(tab)
  tabs.splice(tabs.indexOf(tab), 1)
  const terminal = terminals.get(id)
  if (terminal === undefined) {
    return true
  }
  terminal.pty.kill()
  if (process.platform !== 'win32') {
    setTimeout(() => {
      if (terminals.get(id) === terminal) {
        terminal.pty.kill('SIGKILL')
      }
    }, KILL_DELAY)
  }
  return true
}

function output(id: number, terminal: Terminal, data: Buffer) {
  terminal.history.push(data)
  terminal.historySize += data.length
  while (terminal.historySize > HISTORY_LIMIT && terminal.history.length > 1) {
    terminal.historySize -= terminal.history[0].length
    terminal.history.shift()
  }
  for (const connection of connections.values()) {
    forward(connection, id, false, data)
  }
  terminal.scanner.scan(data)
  if (
    [...connections.values()].some(
      (connection) => connection.client.socket.bufferedAmount > OUTPUT_LIMIT
    )
  ) {
    terminal.pty.pause()
    paused.add(terminal.pty)
    draining ??= drain()
  }
}

function drain() {
  const progress = new Map<Connection, { queued: number; at: number }>()
  return setInterval(() => {
    let full = false
    for (const connection of connections.values()) {
      const queued = connection.client.socket.bufferedAmount
      if (queued <= OUTPUT_LIMIT) {
        continue
      }
      const now = Date.now()
      const last = progress.get(connection) ?? { queued: Infinity, at: now }
      if (queued < last.queued) {
        last.at = now
      }
      last.queued = queued
      progress.set(connection, last)
      if (now - last.at > STALL_LIMIT) {
        log.warn('a browser is not reading fast enough, disconnecting it')
        connection.client.socket.terminate()
        continue
      }
      full = true
    }
    if (full) {
      return
    }
    if (draining !== null) {
      clearInterval(draining)
    }
    draining = null
    for (const pty of paused) {
      pty.resume()
    }
    paused.clear()
  }, 10)
}

function findTab(id: number) {
  return tabs.find((tab) => tab.id === id)
}

function viewTabs(view: string) {
  return tabs.filter((tab) => terminalViewOf(tab) === view)
}

function release(tab: TerminalTab) {
  const view = terminalViewOf(tab)
  if (active.get(view) !== tab.id) {
    return
  }
  const list = viewTabs(view)
  const index = list.indexOf(tab)
  const next = list[index + 1] ?? list[index - 1]
  if (next === undefined) {
    active.delete(view)
  } else {
    active.set(view, next.id)
  }
}

function layout(): TerminalLayout {
  return { tabs, active: Object.fromEntries(active) }
}

function publish() {
  const event: TerminalEvent = { type: 'layout', layout: layout() }
  for (const connection of connections.values()) {
    send(connection, event)
  }
  broadcast({ type: 'terminals', tabs })
}

function forward(
  connection: Connection,
  id: number,
  replay: boolean,
  data: Buffer
) {
  connection.client.socket.send(
    encodeFrame(replay ? FRAME_REPLAY : FRAME_OUTPUT, id, data)
  )
}

function send(connection: Connection, event: TerminalEvent) {
  connection.client.send({ type: 'terminal', event })
}
