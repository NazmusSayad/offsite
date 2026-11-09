import { useEffect } from 'react'
import {
  applyTheme,
  editorOptions,
  loadEditorFont,
  type monaco,
} from '@/features/files/monaco'
import { logger } from '@/lib/log'
import { useStore } from '@/lib/store'
import { useCodeTheme } from '@/lib/theme'

const log = logger.withTag('editor')

export function useEditorAppearance(
  editor: monaco.editor.IStandaloneCodeEditor | null,
  diff: monaco.editor.IStandaloneDiffEditor | null
) {
  const codeTheme = useCodeTheme()
  const prefs = useStore((state) => state.prefs.editor)

  useEffect(() => {
    applyTheme().catch((error: unknown) =>
      log.error('could not apply the theme', error)
    )
  }, [codeTheme])

  useEffect(() => {
    editor?.updateOptions(editorOptions(prefs))
    diff?.updateOptions(editorOptions(prefs))
    loadEditorFont(prefs).catch((error: unknown) =>
      log.error('could not load the editor font', error)
    )
  }, [editor, diff, prefs])
}
