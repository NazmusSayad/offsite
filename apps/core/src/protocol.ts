import type { AppIconId } from './app-icons.ts'
import type { Bookmark, BookmarkRef, BookmarkTarget } from './bookmarks.ts'
import type {
  Config,
  ConfigWithDefaults,
  LastPickedEffortForModel,
  LastMessageAtForAccount,
  LastPickedModelForProvider,
  PromptDelivery,
  SessionSettings,
} from './config.ts'
import type {
  GitAction,
  GitCommit,
  GitRepo,
  GitResource,
  PullRequestBranches,
  PullRequestDraft,
  SourceControlRepo,
  WorktreeBases,
  WorktreeChoice,
  WorktreeDetails,
  WorktreeStage,
} from './git.ts'
import type {
  PermissionDecision,
  ImageAttachment,
  Item,
  PermissionRequest,
  Prompt,
  OutboxPrompt,
} from './items.ts'
import type {
  DirectoryListing,
  FilePreview,
  Project,
  ProjectPatch,
} from './projects.ts'
import type {
  Account,
  Accounts,
  Capabilities,
  LinkPlan,
  Provider,
  ProviderStatus,
  RateLimit,
  Usage,
} from './providers.ts'
import type { PushRegistration } from './push.ts'
import type { MessageMatch, SearchSession } from './search.ts'
import type { ServiceSettings, ServiceState } from './service.ts'
import type {
  SessionActivity,
  ContextUsage,
  ExportDetail,
  RewindRequest,
  RewindResult,
  Session,
  SessionContext,
  SessionPatch,
  SessionRuntime,
} from './sessions.ts'
import type {
  BusyResult,
  Shell,
  TerminalEvent,
  TerminalRequest,
  TerminalTab,
} from './terminal.ts'

export type SyncSnapshot = ConfigWithDefaults & {
  lastUsed: LastPickedModelForProvider[]
  lastSent: LastMessageAtForAccount[]
  lastEfforts: LastPickedEffortForModel[]
  hostname: string
  projects: Project[]
  sessions: Session[]
  outbox: OutboxPrompt[]
  providers: ProviderStatus[]
  activity: Record<string, SessionActivity>
  terminals: TerminalTab[]
  appIcon: AppIconId
  bookmarks: BookmarkRef[]
  service: ServiceState
}

export type RpcMethods = {
  ping: { params: void; result: null }
  sync: { params: void; result: SyncSnapshot }
  'config.get': { params: void; result: ConfigWithDefaults }
  'config.save': { params: Config; result: Config }
  'appIcon.save': { params: AppIconId; result: AppIconId }
  'service.busy': { params: void; result: string[] }
  'service.install': { params: ServiceSettings; result: null }
  'service.update': { params: void; result: null }
  'service.check': {
    params: void
    result: { latest: string; newer: boolean }
  }
  'projects.add': { params: { path: string }; result: Project }
  'projects.update': {
    params: { id: string; patch: ProjectPatch }
    result: null
  }
  'projects.remove': { params: { id: string }; result: null }
  'projects.logoFiles': { params: { id: string }; result: string[] }
  'projects.logoFile': { params: { id: string; path: string }; result: string }
  'projects.worktrees': {
    params: { projectId: string }
    result: WorktreeChoice[]
  }
  'projects.addWorktree': {
    params: { projectId: string; folder: string }
    result: string
  }
  'projects.bases': {
    params: { projectId: string; query: string }
    result: WorktreeBases
  }
  'projects.worktreeDetails': {
    params: { projectId: string }
    result: WorktreeDetails
  }
  'projects.removeWorktree': { params: { projectId: string }; result: null }
  'directories.list': { params: { path: string }; result: DirectoryListing }
  'sessions.update': {
    params: { id: string; patch: SessionPatch }
    result: null
  }
  'sessions.generateTitle': {
    params: { id: string; projectId: string }
    result: null
  }
  'sessions.remove': {
    params: { id: string; projectId: string }
    result: { unusedWorktree: string | null }
  }
  'sessions.moveChanges': {
    params: { projectId: string }
    result: string[]
  }
  'sessions.move': {
    params: { sessionId: string; name: string | null }
    result: { projectId: string; branch: string; setup: boolean }
  }
  'sessions.open': {
    params: {
      sessionId: string
      projectId: string
      opened: boolean
      query: string | null
    }
    result: Session | null
  }
  'sessions.inactive': {
    params: { projectId: string | null; limit: number }
    result: { sessions: Session[]; total: number }
  }
  'sessions.searchable': {
    params: void
    result: { sessions: SearchSession[]; failed: Provider[] }
  }
  'sessions.searchMessages': {
    params: { query: string }
    result: { matches: MessageMatch[]; failed: Provider[] }
  }
  'sessions.earlier': {
    params: { sessionId: string; before: number }
    result: { items: Item[]; before: number | null }
  }
  'sessions.export': {
    params: { sessionId: string; projectId: string }
    result: {
      markdown: Record<ExportDetail, string>
      context: ContextUsage | null
    }
  }
  'sessions.image': {
    params: { sessionId: string; itemId: string; index: number }
    result: ImageAttachment
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
      id: string
      sessionId: string | null
      projectId: string
      prompt: Prompt
      settings: SessionSettings
      delivery: PromptDelivery
      status: 'active' | 'snoozed' | null
      worktree: { name: string | null; base: string | null } | null
    }
    result: null
  }
  'sessions.unqueue': { params: { id: string }; result: null }
  'sessions.resend': { params: { id: string }; result: null }
  'sessions.steer': {
    params: { sessionId: string; id: string }
    result: null
  }
  'sessions.interrupt': { params: { sessionId: string }; result: null }
  'sessions.restart': { params: { sessionId: string }; result: null }
  'sessions.stop': { params: { sessionId: string }; result: null }
  'sessions.runtime': {
    params: { sessionId: string }
    result: SessionRuntime | null
  }
  'sessions.context': {
    params: { sessionId: string; projectId: string }
    result: SessionContext
  }
  'sessions.stopTask': {
    params: { sessionId: string; taskId: string }
    result: null
  }
  'sessions.configure': {
    params: { sessionId: string; settings: SessionSettings }
    result: null
  }
  'sessions.respond': {
    params: {
      sessionId: string
      requestId: string
      decision: PermissionDecision
      answers: Record<string, string> | null
    }
    result: null
  }
  'sessions.rewind': { params: RewindRequest; result: RewindResult }
  'sessions.fork': {
    params: { sessionId: string; projectId: string; messageId: string }
    result: { sessionId: string }
  }
  'bookmarks.list': { params: void; result: Bookmark[] }
  'bookmarks.add': { params: BookmarkTarget; result: null }
  'bookmarks.remove': { params: { id: string }; result: null }
  'accounts.list': { params: void; result: Accounts }
  'accounts.add': {
    params: { provider: Account['provider']; name: string; configDir: string }
    result: null
  }
  'accounts.update': {
    params: {
      id: string
      name: string
      color: string | null
      configDir: string | null
      enabled: boolean
    }
    result: null
  }
  'accounts.remove': { params: { id: string }; result: null }
  'accounts.link': { params: { id: string }; result: null }
  'accounts.linkPlan': { params: { id: string }; result: LinkPlan }
  'accounts.usage': { params: { id: string; force: boolean }; result: Usage }
  capabilities: {
    params: {
      provider: Provider
      accountId: string | null
      projectId: string | null
    }
    result: Capabilities
  }
  'files.list': { params: { projectId: string }; result: string[] }
  'files.entries': {
    params: { projectId: string }
    result: { files: string[]; folders: string[] }
  }
  'files.read': {
    params: { projectId: string; path: string }
    result: FilePreview
  }
  'files.write': {
    params: {
      projectId: string
      path: string
      content: string
      base: string | null
    }
    result: boolean
  }
  'files.create': {
    params: { projectId: string; path: string; folder: boolean }
    result: null
  }
  'files.rename': {
    params: { projectId: string; path: string; to: string }
    result: null
  }
  'files.delete': { params: { projectId: string; path: string }; result: null }
  'files.media': { params: { projectId: string; path: string }; result: string }
  'files.download': {
    params: { projectId: string; path: string }
    result: string
  }
  'files.upload': { params: { name: string; data: string }; result: string }
  'files.browse': { params: void; result: string }
  'dictation.transcribe': { params: { audio: string }; result: string }
  'dictation.ping': { params: void; result: boolean }
  'dictation.workflows': {
    params: void
    result: { id: string; name: string }[]
  }
  'browser.open': {
    params: { url: string; fromPage: boolean }
    result: string
  }
  'tasks.output': {
    params: { sessionId: string; path: string }
    result: { text: string; truncated: boolean } | null
  }
  'git.status': { params: { projectId: string }; result: GitRepo[] }
  'git.diff': {
    params: { projectId: string }
    result: { repo: string; patch: string }[]
  }
  'git.commit': {
    params: { projectId: string; repo: string; message: string; push: boolean }
    result: { message: string }
  }
  'git.changes': { params: { projectId: string }; result: SourceControlRepo[] }
  'git.show': {
    params: { projectId: string; repo: string; ref: string; path: string }
    result: string | null
  }
  'git.history': {
    params: { projectId: string; repo: string; limit: number }
    result: GitCommit[]
  }
  'git.commitFiles': {
    params: {
      projectId: string
      repo: string
      hash: string
      parent: string | null
    }
    result: GitResource[]
  }
  'git.message': {
    params: { projectId: string; repo: string; staged: boolean }
    result: string
  }
  'git.undoCommit': {
    params: { projectId: string; repo: string }
    result: string
  }
  'git.run': {
    params: { projectId: string; repo: string; action: GitAction }
    result: null
  }
  'git.push': { params: { projectId: string; repo: string }; result: null }
  'git.sync': { params: { projectId: string; repo: string }; result: null }
  'git.fetch': { params: { projectId: string }; result: null }
  'git.branches': {
    params: { projectId: string; repo: string }
    result: PullRequestBranches
  }
  'git.localBranches': {
    params: { projectId: string; repo: string }
    result: { name: string; local: boolean; worktree: string | null }[]
  }
  'git.remoteBranches': {
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

export type RpcMethod = keyof RpcMethods

export type RpcCall = {
  [M in RpcMethod]: {
    id: number
    method: M
    params: RpcMethods[M]['params']
    known?: string | null
  }
}[RpcMethod]

export type RpcReply =
  | { type: 'reply'; id: number; result: unknown; hash?: string }
  | { type: 'reply'; id: number; unchanged: true }
  | { type: 'reply'; id: number; error: string }

export type ServerMessage =
  | ServerEvent
  | { type: 'terminal'; event: TerminalEvent }
  | RpcReply

export type ServerEvent =
  | { type: 'activity'; activity: Record<string, SessionActivity> }
  | { type: 'limits'; accountId: string; limits: RateLimit[] }
  | { type: 'usage'; accountId: string; usage: Usage }
  | { type: 'config'; config: Config }
  | { type: 'lastUsed'; lastUsed: LastPickedModelForProvider[] }
  | { type: 'lastSent'; lastSent: LastMessageAtForAccount[] }
  | { type: 'lastEfforts'; lastEfforts: LastPickedEffortForModel[] }
  | { type: 'appIcon'; appIcon: AppIconId }
  | { type: 'service'; service: ServiceState }
  | { type: 'bookmarks'; bookmarks: BookmarkRef[] }
  | { type: 'projects'; projects: Project[] }
  | { type: 'sessions'; sessions: Session[] }
  | { type: 'threads' }
  | { type: 'providers'; providers: ProviderStatus[] }
  | ({ type: 'accounts' } & Accounts)
  | { type: 'started'; sessionId: string; projectId: string; from: string }
  | { type: 'worktreeStage'; stage: WorktreeStage }
  | { type: 'warning'; message: string }
  | { type: 'setup'; projectId: string }
  | {
      type: 'history'
      sessionId: string
      provider: Provider
      items: Item[]
      requests: PermissionRequest[]
      settings: SessionSettings | null
      context: ContextUsage | null
      before: number | null
      partial: string
    }
  | { type: 'items'; sessionId: string; items: Item[] }
  | { type: 'delta'; sessionId: string; text: string }
  | { type: 'request'; sessionId: string; request: PermissionRequest }
  | { type: 'requestDone'; sessionId: string; requestId: string }
  | { type: 'outbox'; outbox: OutboxPrompt[] }
  | { type: 'settings'; sessionId: string; settings: SessionSettings }
  | { type: 'context'; sessionId: string; context: ContextUsage | null }
  | { type: 'notification'; sessionId: string; message: string }
  | { type: 'notifier'; active: boolean }
  | { type: 'terminals'; tabs: TerminalTab[] }
  | { type: 'open'; path: string }
