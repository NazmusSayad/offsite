export type Status = 'inProgress' | 'completed' | 'failed' | 'declined'

export type UserInput =
  | { type: 'text'; text: string; text_elements: [] }
  | { type: 'image'; url: string }
  | { type: 'localImage'; path: string }
  | { type: 'skill'; name: string; path: string }
  | { type: 'mention'; name: string; path: string }

export type ThreadItem = { id: string } & (
  | { type: 'userMessage'; content: UserInput[] }
  | { type: 'agentMessage'; text: string }
  | { type: 'plan'; text: string }
  | { type: 'reasoning'; summary: string[]; content: string[] }
  | {
      type: 'commandExecution'
      command: string
      status: Status
      aggregatedOutput: string | null
    }
  | {
      type: 'fileChange'
      changes: {
        path: string
        kind: { type: 'add' } | { type: 'delete' } | { type: 'update' }
        diff: string
      }[]
      status: Status
    }
  | {
      type: 'mcpToolCall'
      server: string
      tool: string
      status: Status
      arguments: unknown
      result: { content: unknown[] } | null
      error: { message: string } | null
    }
  | {
      type: 'dynamicToolCall'
      tool: string
      arguments: unknown
      status: Status
      contentItems: unknown[] | null
    }
  | {
      type: 'collabAgentToolCall'
      tool: string
      status: Status | 'interrupted'
      receiverThreadIds: string[]
      prompt: string | null
      model: string | null
    }
  | {
      type: 'webSearch'
      query: string
      action:
        | { type: 'search'; query: string | null }
        | { type: 'openPage'; url: string | null }
        | { type: 'findInPage'; url: string | null }
        | { type: 'other' }
        | null
    }
  | { type: 'imageView'; path: string }
  | { type: 'contextCompaction' }
  | {
      type:
        | 'hookPrompt'
        | 'functionCallOutput'
        | 'subAgentActivity'
        | 'sleep'
        | 'imageGeneration'
        | 'enteredReviewMode'
        | 'exitedReviewMode'
    }
)

export type Turn = {
  id: string
  items: ThreadItem[]
  status: 'completed' | 'interrupted' | 'failed' | 'inProgress'
  error: { message: string } | null
  startedAt: number | null
}

export type Thread = {
  id: string
  preview: string
  name: string | null
  cwd: string
  updatedAt: number
  model: string | null
  reasoningEffort: string | null
  gitInfo: { branch: string | null } | null
  turns: Turn[]
}

export type ThreadStarted = { thread: Thread; model: string }

export type RateLimitWindow = {
  usedPercent: number
  windowDurationMins: number | null
  resetsAt: number | null
}

export type RateLimitSnapshot = {
  primary: RateLimitWindow | null
  secondary: RateLimitWindow | null
}

export type CodexModel = {
  model: string
  displayName: string
  description: string
  hidden: boolean
  supportedReasoningEfforts: { reasoningEffort: string }[]
}

export type Skill = { name: string; description: string; path: string }

export type Question = {
  id: string
  header: string
  question: string
  options: { label: string; description: string }[] | null
}
