import type { monaco } from '@/features/files/monaco'

export type Document =
  | { status: 'loading' }
  | {
      status: 'text'
      original: monaco.editor.ITextModel | null
      modified: monaco.editor.ITextModel
      language: string
      saved: number
      dirty: boolean
      base: string
    }
  | { status: 'image'; src: string }
  | { status: 'large'; size: number; limit: number }
  | { status: 'binary' }
  | { status: 'error'; message: string }

export function documentModels(document: Document) {
  if (document.status !== 'text') {
    return []
  }
  return document.original === null
    ? [document.modified]
    : [document.original, document.modified]
}
