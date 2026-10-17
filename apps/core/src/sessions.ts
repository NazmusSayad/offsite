import type { SessionSettings } from './config.ts'
import type { Provider } from './providers.ts'

export type Session = {
  id: string
  provider: Provider
  title: string
  projectId: string
  branch: string | null
  updatedAt: number
  status: 'active' | 'pinned' | 'minimized' | 'inactive'
}

export type SessionPatch = {
  title?: string
  status?: 'active' | 'pinned' | 'minimized' | 'inactive'
}

export type ContextUsage = {
  tokens: number
  window: number | null
}

export type RewindRequest = {
  sessionId: string
  projectId: string
  messageId: string
  settings: SessionSettings
  code: boolean
  conversation: boolean
  dryRun: boolean
}

export type RewindResult = {
  files: string[]
  insertions: number
  deletions: number
} | null

export type TaskStatus = 'running' | 'completed' | 'failed' | 'stopped'

export type SessionActivity = {
  running: boolean
  waiting: boolean
  prompted: boolean
  tasks: Record<string, TaskStatus>
}
