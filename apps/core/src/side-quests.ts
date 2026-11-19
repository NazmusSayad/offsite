import type { SessionSettings } from './config.ts'
import type { Prompt } from './items.ts'

export type SideQuest = {
  id: string
  sessionId: string
  question: string
  answer: string | null
  status: 'answering' | 'answered' | 'failed'
  error: string | null
  createdAt: number
}

export type SideQuestExchange = { question: string; response: string }

export type SideQuestMethods = {
  'sideQuests.list': { params: { sessionId: string }; result: SideQuest[] }
  'sideQuests.ask': {
    params: {
      sessionId: string
      projectId: string
      worktreeId: string | null
      settings: SessionSettings
      prompt: Prompt
    }
    result: null
  }
}
