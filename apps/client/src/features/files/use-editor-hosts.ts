import { useCallback, useState } from 'react'
import { monaco } from '@/features/files/monaco'

export function useEditorHosts() {
  const [editor, setEditor] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null)
  const [diff, setDiff] = useState<monaco.editor.IStandaloneDiffEditor | null>(
    null
  )
  const codeHost = useCallback((element: HTMLDivElement | null) => {
    if (element === null) {
      return
    }
    const instance = monaco.editor.create(element, {
      automaticLayout: true,
      model: null,
    })
    setEditor(instance)
    return () => instance.dispose()
  }, [])
  const diffHost = useCallback((element: HTMLDivElement | null) => {
    if (element === null) {
      return
    }
    const instance = monaco.editor.createDiffEditor(element, {
      automaticLayout: true,
      originalEditable: false,
      experimental: { showMoves: true },
      useInlineViewWhenSpaceIsLimited: true,
    })
    // Monaco turns wrapping off for the hidden left side in inline view and
    // never turns it back on in side-by-side view, where it sets glyphMargin.
    const original = instance.getOriginalEditor()
    original.onDidChangeConfiguration(() => {
      if (
        original.getOption(monaco.editor.EditorOption.glyphMargin) &&
        original.getRawOptions().wordWrapOverride2 === 'off'
      ) {
        original.updateOptions({ wordWrapOverride2: 'inherit' })
      }
    })
    setDiff(instance)
    return () => instance.dispose()
  }, [])
  return { editor, diff, codeHost, diffHost }
}
