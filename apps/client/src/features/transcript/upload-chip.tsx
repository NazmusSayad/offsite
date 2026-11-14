import type { FilePreview as FileContent } from '@offsite/core/projects'
import { call } from '@/api/connection'
import { FileTypeIcon } from '@/components/file-icon'
import { FilePreview } from '@/components/file-preview'
import { mediaKind, mediaUrl } from '@/lib/media'
import type { Preview } from '@/lib/preview'
import { type Place, useStore } from '@/lib/store'

export function UploadChip(props: { path: string }) {
  const selection = useStore((state) => state.selection)
  return (
    <FilePreview
      name={props.path.split(/[\\/]/).at(-1) ?? props.path}
      load={async () => {
        if (selection === null) {
          throw new Error('No thread is open')
        }
        return loadUpload(selection, props.path)
      }}
    >
      <button
        type="button"
        title={props.path}
        className="bg-background/60 border-border/70 mx-0.5 inline-flex h-6 max-w-60 cursor-zoom-in items-center gap-1 rounded-md border px-1.5 align-middle text-xs"
      >
        <FileTypeIcon path={props.path} className="size-3.5 shrink-0" />
        <span className="truncate">{props.path.split(/[\\/]/).at(-1)}</span>
      </button>
    </FilePreview>
  )
}

export function MentionChip(props: { path: string }) {
  const selection = useStore((state) => state.selection)
  return (
    <FilePreview
      name={props.path.split('/').at(-1) ?? props.path}
      load={async () => {
        if (selection === null) {
          throw new Error('No thread is open')
        }
        return loadMention(selection, props.path)
      }}
    >
      <button
        type="button"
        title={props.path}
        className="bg-background/60 border-border/70 mx-0.5 inline-flex h-6 max-w-60 cursor-zoom-in items-center gap-1 rounded-md border px-1.5 align-middle text-xs"
      >
        <FileTypeIcon path={props.path} className="size-3.5 shrink-0" />
        <span className="truncate">
          <span className="text-muted-foreground">@</span>
          {props.path.split('/').at(-1)}
        </span>
      </button>
    </FilePreview>
  )
}

export async function loadMention(
  place: Place,
  path: string
): Promise<Preview> {
  const kind = mediaKind(path)
  if (kind !== null) {
    return { kind, src: await mediaUrl(place, path) }
  }
  return previewOf(
    await call(place.machine, 'files.read', {
      projectId: place.projectId,
      worktreeId: place.worktreeId,
      path,
    })
  )
}

async function loadUpload(place: Place, path: string): Promise<Preview> {
  const kind = mediaKind(path)
  if (kind !== null) {
    return { kind, src: await mediaUrl(place, path) }
  }
  return previewOf(await call(place.machine, 'files.readUpload', { path }))
}

function previewOf(result: FileContent): Preview {
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
