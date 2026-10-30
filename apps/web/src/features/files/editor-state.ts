import type { monaco } from '@/features/files/monaco'
import type { Sort, TabSpec } from '@/features/source-control/changes'

export type EditorSettings = {
  view: 'explorer' | 'scm'
  sidebar: boolean
  width: number
  tree: boolean
  sort: Sort
  messages: Record<string, string>
  graphHeight: number
  inline: boolean
  whitespace: boolean
  collapse: boolean
  smartCommit: boolean
  preview: boolean
}

export type EditorState = {
  tabs: {
    spec: TabSpec
    view: monaco.editor.ICodeEditorViewState | null
  }[]
  active: string | null
  expanded: string[]
  settings: EditorSettings
}

export function loadEditorState(
  machine: string,
  projectId: string
): EditorState {
  const raw = localStorage.getItem(`editorWindow ${machine} ${projectId}`)
  if (raw !== null) {
    return JSON.parse(raw)
  }
  return {
    tabs: [],
    active: null,
    expanded: [],
    settings: {
      view: 'explorer',
      sidebar: true,
      width: 300,
      tree: true,
      sort: 'path',
      messages: {},
      graphHeight: 240,
      inline: false,
      whitespace: true,
      collapse: false,
      smartCommit: true,
      preview: false,
    },
  }
}

export function saveEditorState(
  machine: string,
  projectId: string,
  state: EditorState
) {
  localStorage.setItem(
    `editorWindow ${machine} ${projectId}`,
    JSON.stringify(state)
  )
}
