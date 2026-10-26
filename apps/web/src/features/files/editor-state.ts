import type { monaco } from '@/features/files/monaco'

export type EditorState = {
  tabs: {
    path: string
    pinned: boolean
    view: monaco.editor.ICodeEditorViewState | null
  }[]
  active: string | null
  expanded: string[]
  sidebar: boolean
  width: number
}

export function loadEditorState(machine: string, projectId: string) {
  const raw = localStorage.getItem(`editor ${machine} ${projectId}`)
  const state: EditorState | null = raw === null ? null : JSON.parse(raw)
  return state
}

export function saveEditorState(
  machine: string,
  projectId: string,
  state: EditorState
) {
  localStorage.setItem(`editor ${machine} ${projectId}`, JSON.stringify(state))
}
