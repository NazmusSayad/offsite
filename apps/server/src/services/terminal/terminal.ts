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
  GLOBAL_TERMINALS,
  type TerminalEvent,
  type TerminalLayout,
  type TerminalProject,
  type TerminalRequest,
  type TerminalTab,
} from '@offsite/core/terminal'
import type { Client } from '../../lib/hub.ts'
import { workingDirectory } from '../../storage/config.ts'
import { projectPath } from '../projects.ts'
import { notifierClient, pushActive, sendPush } from '../push.ts'
import { ALERT_DELAY, type Alert, Alerts, Scanner } from './alerts.ts'
import { busyProgram, currentDirectory, startShell } from './process.ts'

type Connection = {
  client: Client
  sizes: Map<number, { cols: number; rows: number }>
}

type Terminal = {
  pty: IPty
  history: Buffer[]
  historySize: number
  owner: Connection | null
  alerts: Alerts
  scanner: Scanner
}

const HISTORY_LIMIT = 2 * 1024 * 1024
const OUTPUT_LIMIT = 1024 * 1024
const STALL_LIMIT = 10_000
const SILENCE_LIMIT = 90_000
const KILL_DELAY = 3000

const instance = `${Date.now()}-${randomUUID()}`
const projects = new Map<string, TerminalProject>()
const terminals = new Map<number, Terminal>()
const connections = new Map<Client, Connection>()
const paused = new Set<IPty>()
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
  const connection = connections.get(client)
  if (connection === undefined) {
    throw new Error('the terminal is not attached')
  }
  await request(connection, message)
}

export function terminalInput(client: Client, frame: Buffer) {
  const connection = connections.get(client)
  if (connection === undefined) {
    console.warn('terminal input from a browser that is not attached')
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
    console.warn(`could not tell if terminal ${id} is busy: ${error}`)
    return { error: String(error) }
  }
}

export function terminalCount(projectId: string) {
  return projects.get(projectId)?.tabs.length ?? 0
}

export function closeProjectTabs(projectId: string) {
  const project = projects.get(projectId)
  if (project === undefined) {
    return
  }
  for (const tab of [...project.tabs]) {
    closeTab(tab.id)
  }
  publish()
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
  for (const project of projects.values()) {
    for (const tab of project.tabs) {
      forward(
        connection,
        tab.id,
        true,
        Buffer.concat(terminals.get(tab.id)?.history ?? [])
      )
    }
  }
}

async function request(
  connection: Connection,
  message: Exclude<TerminalRequest, { type: 'attach' | 'detach' }>
) {
  switch (message.type) {
    case 'resize': {
      const terminal = terminals.get(message.id)
      if (terminal === undefined) {
        return
      }
      connection.sizes.set(message.id, {
        cols: message.cols,
        rows: message.rows,
      })
      terminal.owner = connection
      terminal.pty.resize(message.cols, message.rows)
      return
    }
    case 'createTab':
      await createTab(message.projectId)
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
    case 'minimizeTab': {
      const project = [...projects.values()].find((item) =>
        item.tabs.some((tab) => tab.id === message.id)
      )
      if (project === undefined) {
        return
      }
      if (
        !project.tabs.some((tab) => tab.id !== message.id && !tab.minimized)
      ) {
        return
      }
      const index = project.tabs.findIndex((tab) => tab.id === message.id)
      project.tabs[index].minimized = true
      if (project.activeTab === message.id) {
        const next = nearestVisible(project.tabs, index)
        project.activeTab = next === undefined ? null : project.tabs[next].id
      }
      break
    }
    case 'select': {
      const project = projects.get(message.projectId) ?? {
        tabs: [],
        activeTab: null,
      }
      projects.set(message.projectId, project)
      const tab = project.tabs.find((item) => item.id === message.tabId)
      if (tab !== undefined) {
        tab.minimized = false
        project.activeTab = tab.id
      }
      if (project.tabs.length === 0) {
        await createTab(message.projectId)
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
    console.warn(`ignoring terminal input: ${error}`)
    return
  }
  const terminal = terminals.get(frame.id)
  if (terminal === undefined) {
    console.warn(`input for terminal ${frame.id}, which does not exist`)
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
      terminal.pty.resize(size.cols, size.rows)
    }
  } else {
    console.warn(`ignoring terminal input of unknown kind ${frame.kind}`)
    return
  }
  terminal.pty.write(Buffer.from(frame.data))
}

async function createTab(projectId: string) {
  const cwd =
    projectId === GLOBAL_TERMINALS ? workingDirectory() : projectPath(projectId)
  if (!statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`${cwd} is not a folder, terminal not created`)
    return
  }
  const project = projects.get(projectId) ?? { tabs: [], activeTab: null }
  projects.set(projectId, project)
  const active =
    project.activeTab === null ? undefined : terminals.get(project.activeTab)
  let directory = cwd
  if (active !== undefined) {
    try {
      directory = await currentDirectory(
        active.pty.pid,
        active.scanner.directory
      )
    } catch (error) {
      console.warn(
        `starting in the project folder, could not read the folder of the active terminal: ${error}`
      )
    }
  }
  nextTab += 1
  const id = nextTab
  let pty: IPty
  try {
    pty = startShell(directory)
  } catch (error) {
    console.error(`could not start terminal ${id}: ${error}`)
    return
  }
  const terminal: Terminal = {
    pty,
    history: [],
    historySize: 0,
    owner: null,
    alerts: new Alerts(),
    scanner: new Scanner(),
  }
  terminals.set(id, terminal)
  project.tabs.push({ id, customName: null, minimized: false })
  project.activeTab = id
  pty.onData((data) => output(id, terminal, Buffer.from(data)))
  pty.onExit(() => {
    terminals.delete(id)
    paused.delete(pty)
    if (closeTab(id)) {
      publish()
    }
  })
}

function closeTab(id: number) {
  const project = [...projects.values()].find((item) =>
    item.tabs.some((tab) => tab.id === id)
  )
  if (project === undefined) {
    return false
  }
  const index = project.tabs.findIndex((tab) => tab.id === id)
  project.tabs.splice(index, 1)
  if (project.activeTab === id) {
    let next: number | undefined = nearestVisible(project.tabs, index)
    if (next === undefined && project.tabs.length > 0) {
      next = Math.min(index, project.tabs.length - 1)
    }
    if (next !== undefined) {
      project.tabs[next].minimized = false
    }
    project.activeTab = next === undefined ? null : project.tabs[next].id
  }
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
  scan(id, terminal, data)
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
        console.warn('a browser is not reading fast enough, disconnecting it')
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

function scan(id: number, terminal: Terminal, data: Buffer) {
  const alert = terminal.scanner.scan(data)
  if (!pushActive() || alert === null || notifierWatching()) {
    return
  }
  const started =
    alert.type === 'bell'
      ? terminal.alerts.startBell()
      : terminal.alerts.startNotification()
  if (!started) {
    return
  }
  const windowTitle = terminal.scanner.title
  setTimeout(() => push(id, alert, windowTitle), ALERT_DELAY)
}

function push(id: number, alert: Alert, windowTitle: string) {
  const terminal = terminals.get(id)
  if (terminal === undefined) {
    return
  }
  let title = ''
  let body: string
  if (alert.type === 'bell') {
    if (!terminal.alerts.finishBell()) {
      return
    }
    body = 'Bell'
  } else {
    title = alert.title
    body = alert.body
  }
  if (notifierWatching()) {
    return
  }
  const entry = [...projects].find(([, project]) =>
    project.tabs.some((tab) => tab.id === id)
  )
  if (entry === undefined) {
    return
  }
  const tab = findTab(id)
  if (title === '') {
    title = tab?.customName ?? (windowTitle || 'Terminal')
  }
  void sendPush({
    kind: 'terminal',
    title,
    body,
    projectId: entry[0],
    tabId: id,
  })
}

function notifierWatching() {
  const client = notifierClient()
  if (client === null || !connections.has(client)) {
    return false
  }
  return Date.now() - client.heardAt < SILENCE_LIMIT
}

function findTab(id: number): TerminalTab | undefined {
  return [...projects.values()]
    .flatMap((project) => project.tabs)
    .find((tab) => tab.id === id)
}

function nearestVisible(tabs: TerminalTab[], index: number) {
  for (let position = index; position < tabs.length; position++) {
    if (!tabs[position].minimized) {
      return position
    }
  }
  for (
    let position = Math.min(index, tabs.length) - 1;
    position >= 0;
    position--
  ) {
    if (!tabs[position].minimized) {
      return position
    }
  }
  return undefined
}

function layout(): TerminalLayout {
  return Object.fromEntries(projects)
}

function publish() {
  const event: TerminalEvent = { type: 'layout', layout: layout() }
  for (const connection of connections.values()) {
    send(connection, event)
  }
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
