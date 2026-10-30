import type { EditorSettings } from '@/features/files/editor-state'
import type { Document } from '@/features/files/use-tabs'

export function DocumentNotice(props: {
  document: Document | undefined
  view: EditorSettings['view']
}) {
  const notice = noticeFor(props.document, props.view)
  if (notice === null) {
    return null
  }
  return (
    <p className="text-muted-foreground grid size-full place-items-center p-6 text-center text-sm">
      {notice}
    </p>
  )
}

function noticeFor(
  document: Document | undefined,
  view: EditorSettings['view']
) {
  if (document === undefined) {
    return view === 'explorer'
      ? 'Open a file from the explorer to start editing.'
      : 'Select a change to see its diff.'
  }
  if (document.status === 'large') {
    return `This file is ${formatSize(document.size)}, too large to open in the editor (limit ${formatSize(document.limit)}).`
  }
  if (document.status === 'binary') {
    return 'The file is not displayed in the text editor because it is either binary or uses an unsupported text encoding.'
  }
  if (document.status === 'error') {
    return document.message
  }
  return null
}

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
