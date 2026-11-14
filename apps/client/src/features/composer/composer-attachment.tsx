import { FileIcon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Node } from '@tiptap/core'
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react'
import { lazy, Suspense, useState } from 'react'
import { readBase64 } from '@/api/upload'
import {
  FileHoverPreview,
  type FilePreviewContent,
  PREVIEW_TEXT_LIMIT,
} from '@/components/file-hover-preview'
import { ImageHoverPreview } from '@/components/image-hover-preview'
import { mediaKind } from '@/lib/media'
import { draftKey, useStore } from '@/lib/store'
import { fileMarker, loadDraftFile, useDraft } from './drafts'

const ImageViewer = lazy(async () => ({
  default: (await import('@/components/image-viewer')).ImageViewer,
}))

export const Attachment = Node.create({
  name: 'attachment',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,
  draggable: false,
  addAttributes() {
    return { marker: { default: '' } }
  },
  renderText: (options) => String(options.node.attrs.marker),
  renderHTML: (options) => [
    'span',
    { 'data-marker': options.node.attrs.marker },
    String(options.node.attrs.marker),
  ],
  addNodeView() {
    return ReactNodeViewRenderer(AttachmentChip)
  },
})

function AttachmentChip(props: ReactNodeViewProps) {
  const marker = String(props.node.attrs.marker)
  const key = useStore((state) =>
    state.selection === null ? '' : draftKey(state.selection)
  )
  const draft = useDraft(key)
  const image = draft.images.find(
    (item) => `[Image #${item.number}]` === marker
  )
  const file = draft.files.find((item) => fileMarker(item) === marker)
  const [open, setOpen] = useState(false)
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className="bg-muted border-border/70 mx-0.5 inline-flex h-5.5 max-w-60 items-center gap-1 rounded-md border p-0.5 align-top text-xs"
    >
      {image === undefined && file === undefined && (
        <span className="flex min-w-0 items-center gap-1 ps-0.5">
          <HugeiconsIcon
            icon={FileIcon}
            className="text-muted-foreground size-3.5 shrink-0"
          />
          <span className="truncate">{marker}</span>
        </span>
      )}
      {image === undefined && file !== undefined && (
        <FileHoverPreview load={() => loadFile(file.id, file.name)}>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 ps-0.5"
          >
            <HugeiconsIcon
              icon={FileIcon}
              className="text-muted-foreground size-3.5 shrink-0"
            />
            <span className="truncate">{file.name}</span>
          </button>
        </FileHoverPreview>
      )}
      {image !== undefined && (
        <ImageHoverPreview
          src={`data:${image.mediaType};base64,${image.data}`}
          alt={`Image #${image.number}`}
          onOpen={() => setOpen(true)}
        >
          <button
            type="button"
            className="flex min-w-0 cursor-zoom-in items-center gap-1"
            onClick={() => setOpen(true)}
          >
            <img
              src={`data:${image.mediaType};base64,${image.data}`}
              alt=""
              className="size-4 shrink-0 rounded-sm object-cover"
            />
            <span className="truncate">Image #{image.number}</span>
          </button>
        </ImageHoverPreview>
      )}
      <button
        type="button"
        title="Remove"
        aria-label="Remove"
        className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground grid size-4 shrink-0 cursor-pointer place-items-center rounded-sm"
        onClick={() => {
          const start = props.getPos()
          if (start === undefined) {
            return
          }
          const state = props.editor.state
          const end = start + props.node.nodeSize
          const after = state.doc.resolve(end).nodeAfter
          props.editor.view.dispatch(
            state.tr.delete(
              start,
              after?.text?.startsWith(' ') === true ? end + 1 : end
            )
          )
        }}
      >
        <HugeiconsIcon icon={XIcon} className="size-3" />
      </button>
      {open && image !== undefined && (
        <Suspense>
          <ImageViewer
            src={`data:${image.mediaType};base64,${image.data}`}
            alt=""
            name={`Image #${image.number}`}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </NodeViewWrapper>
  )
}

async function loadFile(id: string, name: string): Promise<FilePreviewContent> {
  const file = await loadDraftFile(id)
  if (file === undefined) {
    throw new Error(`${name} is no longer saved, attach it again`)
  }
  const kind = mediaKind(name)
  if (kind !== null) {
    return { kind, src: `data:${file.type};base64,${await readBase64(file)}` }
  }
  const text = await file.slice(0, PREVIEW_TEXT_LIMIT * 4).text()
  if (text.includes('\0')) {
    throw new Error('No preview for this file')
  }
  return { kind: 'text', text }
}
