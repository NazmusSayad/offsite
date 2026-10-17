import type { GitRepo, PullRequestBranches, PullRequestDraft } from './git.ts'
import type {
  BusyResult,
  Shell,
  TerminalEvent,
  TerminalRequest,
} from './terminal.ts'

export type Provider = 'claude' | 'codex' | 'opencode'

export type RateLimit = {
  window: string
  utilization: number | null
  resetsAt: number | null
  rejected: boolean
}

export type Session = {
  id: string
  provider: Provider
  title: string
  projectId: string
  branch: string | null
  updatedAt: number
  status: 'active' | 'pinned' | 'minimized' | 'inactive'
}

export type Project = {
  id: string
  path: string
  name: string
  logo: string | null
}

export type ProviderStatus = {
  provider: Provider
  state: 'loading' | 'ready' | 'missing' | 'error' | 'disabled'
  error: string | null
}

export type ProjectPatch = { name?: string; logo?: string | null }

export type Directories = {
  path: string
  parent: string | null
  directories: { name: string; path: string }[]
}

export type Snapshot = ConfigInfo & {
  composer: Composer
  hostname: string
  projects: Project[]
  sessions: Session[]
  providers: ProviderStatus[]
  activity: Record<string, Activity>
}

export type SessionPatch = {
  title?: string
  status?: 'active' | 'pinned' | 'minimized' | 'inactive'
}

export type Context = {
  tokens: number
  window: number | null
}

export type Account = {
  id: string
  provider: Exclude<Provider, 'opencode'>
  name: string
  configDir: string | null
  enabled: boolean
  hiddenModels: Record<string, boolean>
  email: string | null
  plan: string | null
  error: string | null
  limits: RateLimit[]
  linked: boolean
  valid: boolean
}

export type Accounts = {
  claudeAccounts: Account[]
  codexAccounts: Account[]
  openCode: { available: boolean }
}

export type Model = {
  value: string
  name: string
  description: string
  efforts: string[]
  deprecated: boolean
  hidden: boolean
  effort: string | null
}

export type ModelSetting = { hidden: boolean; effort: string | null }

export type Command = { name: string; description: string; hint: string }

export type Agent = { id: string; name: string; description: string }

export type Capabilities = {
  models: Model[]
  defaultModel: string | null
  commands: Command[]
  agents: Agent[]
}

export type ProviderCapabilities = Omit<
  Capabilities,
  'models' | 'defaultModel'
> & {
  models: Omit<Model, 'deprecated' | 'hidden' | 'effort'>[]
}

export type ProviderSettings = {
  accountId: string | null
  model: string | null
  effort: string | null
  mode: string | null
  plan: boolean
}

export type Settings = ProviderSettings & { provider: Provider }

export type Rewind = {
  sessionId: string
  projectId: string
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

export type FilePreview =
  | { kind: 'text'; size: number; content: string }
  | { kind: 'image'; size: number; mediaType: string; data: string }
  | { kind: 'binary'; size: number }
  | { kind: 'large'; size: number; limit: number }

export type Platform = 'macos' | 'linux' | 'windows'

export type TerminalIdentity = 'offsite' | 'ghostty' | 'iterm2'

export type TerminalConfig = {
  shell: Record<Platform, string | null>
  behavior: { terminalIdentity: TerminalIdentity; shellIntegration: boolean }
}

export type AccountConfig = {
  id: string
  provider: Exclude<Provider, 'opencode'>
  name: string
  configDir: Record<Platform, string | null>
  enabled: boolean
  hiddenModels: Record<string, boolean>
}

export type Composer = { provider: Provider } & Record<
  Provider,
  ProviderSettings
>

export type Config = {
  claudeBaseDir: Record<Platform, string | null>
  claudeAccounts: AccountConfig[]
  codexAccounts: AccountConfig[]
  enabledProviders: Record<Provider, boolean>
  commitMessage: {
    provider: Provider | null
    accountId: string | null
    model: string | null
  }
  models: Record<Provider, Record<string, ModelSetting>>
  delivery: Delivery
  autoSkipQuestionTimeout: number | null
  autoPermissionMode: 'allow' | 'deny'
  autoPermissionTimeout: number | null
  terminal: TerminalConfig
}

export type ConfigInfo = {
  config: Config
  defaults: Config
  platform: Platform
  defaultShell: string
  defaultClaudeBaseDir: string
}

export type PushMessage =
  | {
      kind: 'terminal'
      title: string
      body: string
      projectId: string
      tabId: number
    }
  | {
      kind: 'session'
      title: string
      body: string
      projectId: string
      sessionId: string
    }

export type Image = { mediaType: string; data: string }

export type Prompt = { text: string; images: Image[] }

export type Queued = { id: string; prompt: Prompt }

export type ItemStatus = 'running' | 'completed' | 'failed' | 'stopped'

export type ItemImage = { mediaType: string; data: string | null }

export type Question = {
  question: string
  header: string
  multiSelect: boolean
  options: { label: string; description: string }[]
}

export type TodoStep = {
  text: string
  status: 'pending' | 'running' | 'completed'
}

export type Background = {
  taskId: string | null
  outputPath: string | null
  events: string[]
}

export type Item = {
  id: string
  parent: string | null
  time: number | null
} & (
  | {
      kind: 'user'
      text: string
      images: ItemImage[]
      format: 'text' | 'command' | 'output'
    }
  | { kind: 'assistant'; text: string; message: string }
  | { kind: 'reasoning'; text: string }
  | {
      kind: 'command'
      command: string
      description: string
      output: string
      status: ItemStatus
      background: Background | null
    }
  | {
      kind: 'file_change'
      path: string
      diffs: { before: string; after: string }[]
      output: string
      status: ItemStatus
    }
  | {
      kind: 'web_search'
      query: string | null
      url: string | null
      results: { title: string; url: string }[]
      output: string
      status: ItemStatus
    }
  | { kind: 'skill'; skill: string; output: string; status: ItemStatus }
  | {
      kind: 'tool'
      name: string
      input: Record<string, unknown>
      output: string
      status: ItemStatus
    }
  | { kind: 'todo_list'; steps: TodoStep[] }
  | { kind: 'plan'; plan: string }
  | {
      kind: 'question'
      questions: Question[]
      answers: Record<string, string> | null
      status: ItemStatus
    }
  | {
      kind: 'subagent'
      agent: string
      description: string
      agentId: string | null
      status: ItemStatus
    }
  | {
      kind: 'agent_message'
      target: string | null
      summary: string
      status: ItemStatus
    }
  | { kind: 'compaction' }
  | { kind: 'notice'; text: string }
  | { kind: 'error'; text: string }
)

export type PermissionRequest = (
  | {
      id: string
      kind: 'approval'
      title: string
      canAlwaysAllow: boolean
      item: Item
    }
  | { id: string; kind: 'plan'; plan: string }
  | { id: string; kind: 'question'; questions: Question[] }
) & { autoResolve?: { at: number; decision: 'allow' | 'deny' } }

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

export type PushRegistration = {
  subscription: PushSubscriptionInfo
  publicKey: string
  privateKey: string
  machine: string
}

export type Methods = {
  ping: { params: void; result: null }
  sync: { params: void; result: Snapshot }
  'config.get': { params: void; result: ConfigInfo }
  'config.save': { params: Config; result: Config }
  'composer.get': { params: void; result: Composer }
  'composer.save': { params: Composer; result: Composer }
  'projects.add': { params: { path: string }; result: Project }
  'projects.update': {
    params: { id: string; patch: ProjectPatch }
    result: null
  }
  'projects.remove': { params: { id: string }; result: null }
  'directories.list': { params: { path: string }; result: Directories }
  'sessions.update': {
    params: { id: string; patch: SessionPatch }
    result: null
  }
  'sessions.remove': { params: { id: string }; result: null }
  'sessions.open': {
    params: { sessionId: string; projectId: string }
    result: null
  }
  'sessions.earlier': {
    params: { sessionId: string; before: number }
    result: { items: Item[]; before: number | null }
  }
  'sessions.image': {
    params: { sessionId: string; itemId: string; index: number }
    result: Image
  }
  'sessions.agent': {
    params: {
      sessionId: string
      projectId: string
      agentId: string
      parent: string
    }
    result: Item[]
  }
  'sessions.send': {
    params: {
      sessionId: string | null
      projectId: string
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
  'sessions.steer': {
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
    params: { sessionId: string; projectId: string; messageId: string }
    result: { sessionId: string }
  }
  'accounts.list': { params: void; result: Accounts }
  'accounts.add': {
    params: { provider: Account['provider']; name: string; configDir: string }
    result: null
  }
  'accounts.update': {
    params: {
      id: string
      name: string
      configDir: string | null
      enabled: boolean
      hiddenModels: Record<string, boolean>
    }
    result: null
  }
  'accounts.remove': { params: { id: string }; result: null }
  capabilities: {
    params: {
      provider: Provider
      accountId: string | null
      projectId: string | null
    }
    result: Capabilities
  }
  'files.list': { params: { projectId: string }; result: string[] }
  'files.read': {
    params: { projectId: string; path: string }
    result: FilePreview
  }
  'files.media': { params: { projectId: string; path: string }; result: string }
  'files.upload': { params: { name: string; data: string }; result: string }
  'tasks.output': {
    params: { sessionId: string; path: string }
    result: { text: string; truncated: boolean } | null
  }
  'git.status': { params: { projectId: string }; result: GitRepo[] }
  'git.diff': { params: { projectId: string }; result: string }
  'git.commit': {
    params: { projectId: string; repo: string; message: string; push: boolean }
    result: { message: string }
  }
  'git.push': { params: { projectId: string; repo: string }; result: null }
  'git.branches': {
    params: { projectId: string; repo: string }
    result: PullRequestBranches
  }
  'git.localBranches': {
    params: { projectId: string; repo: string }
    result: string[]
  }
  'git.switch': {
    params: { projectId: string; repo: string; branch: string; create: boolean }
    result: null
  }
  'git.pullRequest': {
    params: { projectId: string; repo: string; base: string; commit: boolean }
    result: PullRequestDraft
  }
  'git.createPullRequest': {
    params: {
      projectId: string
      repo: string
      base: string
      head: string
      title: string
      body: string
    }
    result: { url: string }
  }
  'push.subscribe': { params: PushRegistration; result: null }
  'push.unsubscribe': { params: { endpoint: string }; result: null }
  'notifications.claim': { params: { endpoint: string | null }; result: null }
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

export type ServerEvent =
  | { type: 'activity'; activity: Record<string, Activity> }
  | { type: 'limits'; accountId: string; limits: RateLimit[] }
  | { type: 'config'; config: Config }
  | { type: 'composer'; composer: Composer }
  | { type: 'projects'; projects: Project[] }
  | { type: 'sessions'; sessions: Session[] }
  | { type: 'providers'; providers: ProviderStatus[] }
  | ({ type: 'accounts' } & Accounts)
  | { type: 'started'; sessionId: string; projectId: string }
  | {
      type: 'history'
      sessionId: string
      provider: Provider
      items: Item[]
      requests: PermissionRequest[]
      queue: Queued[]
      settings: Settings | null
      context: Context | null
      before: number | null
      partial: string
    }
  | { type: 'items'; sessionId: string; items: Item[] }
  | { type: 'delta'; sessionId: string; text: string }
  | { type: 'request'; sessionId: string; request: PermissionRequest }
  | { type: 'requestDone'; sessionId: string; requestId: string }
  | { type: 'queue'; sessionId: string; queue: Queued[] }
  | { type: 'settings'; sessionId: string; settings: Settings }
  | { type: 'context'; sessionId: string; context: Context | null }
  | { type: 'notification'; sessionId: string; message: string }
  | { type: 'notifier'; active: boolean }
