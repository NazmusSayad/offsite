export type ImageAttachment = { mediaType: string; data: string }

export type Prompt = { text: string; images: ImageAttachment[] }

export type QueuedPrompt = { id: string; prompt: Prompt }

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

export type BackgroundTask = {
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
      background: BackgroundTask | null
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

export type PermissionDecision = 'allow' | 'always' | 'deny'
