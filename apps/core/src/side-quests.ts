import type { SessionSettings } from './config.ts'
import type { ImageAttachment, Prompt } from './items.ts'

export type SideQuest = {
  id: string
  sessionId: string
  questId: string
  question: string
  images: ImageAttachment[]
  answer: string | null
  status: 'answering' | 'answered' | 'failed'
  error: string | null
  createdAt: number
}

export type SideQuestMethods = {
  'sideQuests.list': { params: { sessionId: string }; result: SideQuest[] }
  'sideQuests.ask': {
    params: {
      sessionId: string
      questId: string | null
      projectId: string
      worktreeId: string | null
      settings: SessionSettings
      prompt: Prompt
    }
    result: { questId: string }
  }
}
