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

export function isPlain(char: string) {
  return !/[\s*_`#>~|\\[\]()-]/.test(char)
}

export function plainText(text: string) {
  let plain = ''
  const offsets: number[] = []
  for (let index = 0; index < text.length; index++) {
    if (isPlain(text[index])) {
      plain += text[index]
      offsets.push(index)
    }
  }
  return { plain, offsets }
}
