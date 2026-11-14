import { call } from '@/api/connection'
import {
  FileHoverPreview,
  type FilePreviewContent,
} from '@/components/file-hover-preview'
import { FileTypeIcon } from '@/components/file-icon'
import { mediaKind, mediaUrl } from '@/lib/media'
import { useStore } from '@/lib/store'

export function UploadChip(props: { path: string }) {
  const selection = useStore((state) => state.selection)
  return (
    <FileHoverPreview
      load={async () => {
        if (selection === null) {
          throw new Error('No thread is open')
        }
        return loadUpload(selection.machine, selection.projectId, props.path)
      }}
    >
      <button
        type="button"
        title={props.path}
        className="bg-background/60 border-border/70 mx-0.5 inline-flex h-6 max-w-60 items-center gap-1 rounded-md border px-1.5 align-middle text-xs"
      >
        <FileTypeIcon path={props.path} className="size-3.5 shrink-0" />
        <span className="truncate">{props.path.split(/[\\/]/).at(-1)}</span>
      </button>
    </FileHoverPreview>
  )
}

async function loadUpload(
  machine: string,
  projectId: string,
  path: string
): Promise<FilePreviewContent> {
  const kind = mediaKind(path)
  if (kind !== null) {
    return { kind, src: await mediaUrl(machine, projectId, path) }
  }
  const result = await call(machine, 'files.readUpload', { path })
  if (result.kind === 'text') {
    return { kind: 'text', text: result.content }
  }
  if (result.kind === 'image') {
    return {
      kind: 'image',
      src: `data:${result.mediaType};base64,${result.data}`,
    }
  }
  if (result.kind === 'binary') {
    throw new Error('No preview for this file')
  }
  if (result.kind === 'large') {
    throw new Error('This file is too large to preview')
  }
  throw new Error('Unknown file preview')
}
