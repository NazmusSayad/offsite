import type { Session } from './sessions.ts'

export type BookmarkTarget = {
  sessionId: string
  itemId: string | null
  start: number | null
  end: number | null
}

export type BookmarkRef = BookmarkTarget & { id: string; createdAt: number }

export type Bookmark = BookmarkRef & {
  session: Session | null
  message: { author: 'user' | 'assistant'; text: string } | null
}
