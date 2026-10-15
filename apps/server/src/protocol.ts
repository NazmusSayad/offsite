import type {
  EffortLevel,
  PermissionMode,
} from '@anthropic-ai/claude-agent-sdk'

export type { EffortLevel, PermissionMode }

export type RateLimit = {
  window: string
  utilization: number | null
  resetsAt: number | null
  rejected: boolean
}

export type Session = {
  id: string
  title: string
  cwd: string
  branch: string | null
  updatedAt: number
  pinned: boolean
  archived: boolean
}

export type SessionPatch = {
  title?: string
  pinned?: boolean
  archived?: boolean
}

export type Context = {
  tokens: number
  window: number | null
  model: string | null
  categories: {
    name: string
    tokens: number
    kind: 'used' | 'free' | 'buffer'
  }[]
  sections: { title: string; items: { name: string; tokens: number }[] }[]
}

export type Account = {
  id: string
  name: string
  email: string | null
  plan: string | null
  error: string | null
  limits: RateLimit[]
}

export type Model = {
  value: string
  name: string
  description: string
  efforts: EffortLevel[]
}

export type Command = { name: string; description: string; hint: string }

export type Capabilities = { models: Model[]; commands: Command[] }

export type Settings = {
  accountId: string
  model: string | null
  effort: EffortLevel | null
  permissionMode: PermissionMode | null
}

export type Rewind = {
  sessionId: string
  cwd: string
  messageId: string
  settings: Settings
  code: boolean
  conversation: boolean
  dryRun: boolean
}

export type RewindResult = {
  files: string[]
  insertions: number
  deletions: number
} | null

export type GitStatus = {
  branch: string | null
  upstream: string | null
  ahead: number
  behind: number
  changed: number
}

export type Platform = 'macos' | 'linux' | 'windows'

export type TerminalIdentity = 'offsite' | 'ghostty' | 'iterm2'

export type TerminalConfig = {
  shell: Record<Platform, string | null>
  font: { family: string; size: number; lineHeight: number; ligatures: boolean }
  cursor: { style: 'block' | 'bar' | 'underline'; blink: boolean }
  padding: { top: number; right: number; bottom: number; left: number }
  scrollback: number
  boldIsBright: boolean
  behavior: {
    modernizeShiftEnter: boolean
    pasteBrowserImages: boolean
    showGitBranch: boolean
    captureShortcuts: boolean
    bellFlash: boolean
    bellSound: boolean
    terminalIdentity: TerminalIdentity
    shellIntegration: boolean
    clickToMoveCursor: boolean
    optionAsMeta: 'off' | 'left' | 'right' | 'both'
    confirmCloseBusyTab: boolean
  }
}

export type Config = {
  theme: string
  composer: Settings
  terminal: TerminalConfig
}

export type ConfigInfo = {
  config: Config
  defaults: Config
  platform: Platform
  version: string
  defaultShell: string
}

export type TerminalTab = {
  id: number
  customName: string | null
  minimized: boolean
}

export type TerminalProject = { tabs: TerminalTab[]; activeTab: number | null }

export type TerminalLayout = Record<string, TerminalProject>

export type TerminalRequest =
  | { type: 'attach' }
  | { type: 'createTab'; cwd: string }
  | { type: 'closeTab'; id: number }
  | { type: 'renameTab'; id: number; name: string }
  | { type: 'minimizeTab'; id: number }
  | { type: 'select'; cwd: string; tabId: number | null }
  | { type: 'resize'; id: number; cols: number; rows: number }

export type TerminalEvent =
  | {
      type: 'active'
      layout: TerminalLayout
      instance: string
      branches: Record<number, string>
    }
  | { type: 'layout'; layout: TerminalLayout }
  | { type: 'branch'; id: number; branch: string | null }

export type Shell = { name: string; path: string }

export type BusyResult = { program: string | null } | { error: string }

export type TerminalPush = {
  title: string
  body: string
  cwd: string
  tabId: number
}

export type Image = { mediaType: string; data: string }

export type Prompt = { text: string; images: Image[] }

export type Queued = { id: string; prompt: Prompt }

export type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'image'; mediaType: string; data: string }
  | {
      type: 'tool_use'
      id: string
      name: string
      input: Record<string, unknown>
    }
  | {
      type: 'tool_result'
      toolUseId: string
      content: Block[]
      isError: boolean
    }

export type Message =
  | {
      type: 'user' | 'assistant'
      uuid: string
      time: number | null
      content: Block[]
      parent: string | null
    }
  | {
      type: 'notice'
      uuid: string
      time: number | null
      text: string
      isError: boolean
    }

export type PermissionRequest = {
  id: string
  toolName: string
  input: Record<string, unknown>
  title: string | null
  canAlwaysAllow: boolean
}

export type Activity = { running: boolean; waiting: boolean }

export type Delivery = 'queue' | 'steer'

export type Decision = 'allow' | 'always' | 'deny'

export type PushSubscriptionInfo = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type Methods = {
  ping: { params: void; result: null }
  'config.get': { params: void; result: ConfigInfo }
  'config.save': { params: Config; result: Config }
  'folders.save': { params: string[]; result: string[] }
  'sessions.list': { params: void; result: Session[] }
  'sessions.update': {
    params: { id: string; patch: SessionPatch }
    result: Session[]
  }
  'sessions.remove': { params: { id: string }; result: Session[] }
  'sessions.open': { params: { sessionId: string; cwd: string }; result: null }
  'sessions.send': {
    params: {
      sessionId: string | null
      cwd: string
      prompt: Prompt
      settings: Settings
      delivery: Delivery
    }
    result: null
  }
  'sessions.unqueue': {
    params: { sessionId: string; id: string }
    result: null
  }
  'sessions.interrupt': { params: { sessionId: string }; result: null }
  'sessions.configure': {
    params: { sessionId: string; settings: Settings }
    result: null
  }
  'sessions.respond': {
    params: {
      sessionId: string
      requestId: string
      decision: Decision
      answers: Record<string, string> | null
    }
    result: null
  }
  'sessions.rewind': { params: Rewind; result: RewindResult }
  'sessions.fork': {
    params: { sessionId: string; cwd: string; messageId: string }
    result: { sessionId: string }
  }
  'accounts.list': { params: void; result: Account[] }
  'accounts.add': { params: { name: string; token: string }; result: Account[] }
  'accounts.remove': { params: { id: string }; result: Account[] }
  capabilities: {
    params: { accountId: string; cwd: string }
    result: Capabilities
  }
  'files.list': { params: { cwd: string }; result: string[] }
  'files.upload': { params: { name: string; data: string }; result: string }
  'git.status': { params: { cwd: string }; result: GitStatus | null }
  'git.diff': { params: { cwd: string }; result: string }
  'git.commit': {
    params: { cwd: string; message: string }
    result: GitStatus | null
  }
  'git.push': { params: { cwd: string }; result: GitStatus | null }
  'git.pullRequest': { params: { cwd: string }; result: { url: string } }
  'git.message': {
    params: { accountId: string; cwd: string }
    result: { message: string }
  }
  'push.key': { params: void; result: { publicKey: string } }
  'push.subscribe': { params: PushSubscriptionInfo; result: null }
  'push.unsubscribe': { params: { endpoint: string }; result: null }
  terminal: { params: TerminalRequest; result: null }
  'terminal.shells': { params: void; result: Shell[] }
  'terminal.busy': { params: { id: number }; result: BusyResult }
  'terminal.paste': { params: { type: string; data: string }; result: string }
}

export type Method = keyof Methods

export type Call = {
  [M in Method]: { id: number; method: M; params: Methods[M]['params'] }
}[Method]

export type Reply =
  | { type: 'reply'; id: number; result: unknown }
  | { type: 'reply'; id: number; error: string }

export type ServerMessage =
  | ServerEvent
  | { type: 'terminal'; event: TerminalEvent }
  | Reply

export const FRAME_INPUT = 0
export const FRAME_REPLY = 1
export const FRAME_OUTPUT = 2
export const FRAME_REPLAY = 3

export function encodeFrame(kind: number, id: number, data: Uint8Array) {
  const frame = new Uint8Array(5 + data.length)
  frame[0] = kind
  new DataView(frame.buffer).setUint32(1, id)
  frame.set(data, 5)
  return frame
}

export function decodeFrame(frame: Uint8Array) {
  if (frame.length < 5) throw new Error('terminal frame is too short')
  return {
    kind: frame[0],
    id: new DataView(
      frame.buffer,
      frame.byteOffset,
      frame.byteLength
    ).getUint32(1),
    data: frame.subarray(5),
  }
}

export type ServerEvent =
  | { type: 'activity'; activity: Record<string, Activity> }
  | { type: 'limits'; accountId: string; limits: RateLimit[] }
  | { type: 'config'; config: Config }
  | { type: 'folders'; folders: string[] }
  | { type: 'started'; sessionId: string; cwd: string }
  | {
      type: 'history'
      sessionId: string
      messages: Message[]
      requests: PermissionRequest[]
      queue: Queued[]
      settings: Settings | null
      context: Context | null
    }
  | { type: 'message'; sessionId: string; message: Message }
  | { type: 'delta'; sessionId: string; text: string }
  | { type: 'request'; sessionId: string; request: PermissionRequest }
  | { type: 'requestDone'; sessionId: string; requestId: string }
  | { type: 'queue'; sessionId: string; queue: Queued[] }
  | { type: 'settings'; sessionId: string; settings: Settings }
  | { type: 'context'; sessionId: string; context: Context }
  | { type: 'notification'; sessionId: string; message: string }
