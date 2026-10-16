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

export type Project = { path: string; name: string; logo: string | null }

export type ProjectPatch = { name?: string; logo?: string | null }

export type Directories = {
  path: string
  parent: string | null
  directories: { name: string; path: string }[]
}

export type Snapshot = ConfigInfo & {
  projects: Project[]
  sessions: Session[]
  activity: Record<string, Activity>
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
  configDir: string
  email: string | null
  plan: string | null
  error: string | null
  limits: RateLimit[]
  linked: boolean
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
  accountId: string | null
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

export type FilePreview =
  | { kind: 'text'; size: number; content: string }
  | { kind: 'image'; size: number; mediaType: string; data: string }
  | { kind: 'binary'; size: number }
  | { kind: 'large'; size: number; limit: number }

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
  claudeBaseDir: string
  composer: Settings
  terminal: TerminalConfig
  diff: { split: boolean; wrap: boolean }
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
  | { type: 'active'; layout: TerminalLayout; instance: string }
  | { type: 'layout'; layout: TerminalLayout }

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
  | { type: 'image'; mediaType: string; data: string | null }
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
      answers: Record<string, string> | null
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

export type TaskStatus = 'running' | 'completed' | 'failed' | 'stopped'

export type Activity = {
  running: boolean
  waiting: boolean
  prompted: boolean
  tasks: Record<string, TaskStatus>
}

export type Delivery = 'queue' | 'steer'

export type Decision = 'allow' | 'always' | 'deny'

export type PushSubscriptionInfo = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type Methods = {
  ping: { params: void; result: null }
  sync: { params: void; result: Snapshot }
  'config.get': { params: void; result: ConfigInfo }
  'config.save': { params: Config; result: Config }
  'projects.add': { params: { path: string }; result: Project }
  'projects.update': {
    params: { path: string; patch: ProjectPatch }
    result: null
  }
  'projects.remove': { params: { path: string }; result: null }
  'directories.list': { params: { path: string }; result: Directories }
  'sessions.update': {
    params: { id: string; patch: SessionPatch }
    result: null
  }
  'sessions.remove': { params: { id: string }; result: null }
  'sessions.open': { params: { sessionId: string; cwd: string }; result: null }
  'sessions.earlier': {
    params: { sessionId: string; before: number }
    result: { messages: Message[]; before: number | null }
  }
  'sessions.image': {
    params: { sessionId: string; uuid: string; index: number }
    result: Image
  }
  'sessions.agent': {
    params: { sessionId: string; cwd: string; agentId: string; parent: string }
    result: Message[]
  }
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
  'sessions.stopTask': {
    params: { sessionId: string; taskId: string }
    result: null
  }
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
  'accounts.add': {
    params: { name: string; configDir: string }
    result: null
  }
  'accounts.update': {
    params: { id: string; name: string; configDir: string }
    result: null
  }
  'accounts.remove': { params: { id: string }; result: null }
  'accounts.link': { params: { id: string }; result: null }
  capabilities: {
    params: { accountId: string; cwd: string }
    result: Capabilities
  }
  'files.list': { params: { cwd: string }; result: string[] }
  'files.read': { params: { cwd: string; path: string }; result: FilePreview }
  'files.upload': { params: { name: string; data: string }; result: string }
  'tasks.output': {
    params: { sessionId: string; path: string }
    result: { text: string; truncated: boolean } | null
  }
  'git.status': { params: { cwd: string }; result: GitStatus | null }
  'git.diff': { params: { cwd: string }; result: string }
  'git.commit': {
    params: { cwd: string; message: string }
    result: GitStatus | null
  }
  'git.push': { params: { cwd: string }; result: GitStatus | null }
  'git.pullRequest': { params: { cwd: string }; result: { url: string } }
  'git.message': {
    params: { accountId: string | null; cwd: string }
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
  | { type: 'projects'; projects: Project[] }
  | { type: 'sessions'; sessions: Session[] }
  | { type: 'accounts'; accounts: Account[] }
  | { type: 'started'; sessionId: string; cwd: string }
  | {
      type: 'history'
      sessionId: string
      messages: Message[]
      requests: PermissionRequest[]
      queue: Queued[]
      settings: Settings | null
      context: Context | null
      before: number | null
    }
  | { type: 'message'; sessionId: string; message: Message }
  | { type: 'delta'; sessionId: string; text: string }
  | { type: 'request'; sessionId: string; request: PermissionRequest }
  | { type: 'requestDone'; sessionId: string; requestId: string }
  | { type: 'queue'; sessionId: string; queue: Queued[] }
  | { type: 'settings'; sessionId: string; settings: Settings }
  | { type: 'context'; sessionId: string; context: Context }
  | { type: 'notification'; sessionId: string; message: string }
