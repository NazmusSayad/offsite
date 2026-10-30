import { type ReactNode, useEffect, useState } from 'react'
import { monaco } from '@/features/files/monaco'

export function StatusBar(props: {
  editor: monaco.editor.IStandaloneCodeEditor | null
  language: string | null
  children?: ReactNode
}) {
  const [status, setStatus] = useState<ReturnType<typeof readStatus>>(null)

  useEffect(() => {
    const editor = props.editor
    if (editor === null) {
      return
    }
    setStatus(readStatus(editor))
    const subscriptions = [
      editor.onDidChangeCursorSelection(() => setStatus(readStatus(editor))),
      editor.onDidChangeModel(() => setStatus(readStatus(editor))),
      editor.onDidChangeModelOptions(() => setStatus(readStatus(editor))),
    ]
    return () => {
      for (const subscription of subscriptions) {
        subscription.dispose()
      }
    }
  }, [props.editor])

  return (
    <div className="bg-sidebar border-sidebar-border text-muted-foreground flex h-[22px] shrink-0 items-center justify-end gap-4 border-t px-3 text-xs whitespace-nowrap">
      {props.children}
      {props.language !== null && status !== null && (
        <>
          <span>
            Ln {status.line}, Col {status.column}
            {status.selected > 0 && ` (${status.selected} selected)`}
          </span>
          <span>
            {status.spaces ? 'Spaces' : 'Tab Size'}: {status.tabSize}
          </span>
          <span>UTF-8</span>
          <span>{status.eol}</span>
          <span>{props.language}</span>
        </>
      )}
    </div>
  )
}

function readStatus(editor: monaco.editor.IStandaloneCodeEditor) {
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (model === null || selection === null) {
    return null
  }
  const options = model.getOptions()
  return {
    line: selection.positionLineNumber,
    column: selection.positionColumn,
    selected: model.getValueLengthInRange(selection),
    tabSize: options.tabSize,
    spaces: options.insertSpaces,
    eol:
      model.getEndOfLineSequence() === monaco.editor.EndOfLineSequence.LF
        ? 'LF'
        : 'CRLF',
  }
}
