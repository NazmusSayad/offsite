import { FileIcon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Node } from '@tiptap/core'
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react'
import { readBase64 } from '@/api/upload'
import { FileTypeIcon } from '@/components/file-icon'
import { FilePreview } from '@/components/file-preview'
import { loadMention } from '@/features/transcript/upload-chip'
import { mediaKind } from '@/lib/media'
import { type Preview, TEXT_READ_LIMIT } from '@/lib/preview'
import { draftKey, useStore } from '@/lib/store'
import { fileMarker, loadDraftFile, useDraft } from './drafts'

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
  const selection = useStore((state) => state.selection)
  const draft = useDraft(selection === null ? '' : draftKey(selection))
  const image = draft.images.find(
    (item) => `[Image #${item.number}]` === marker
  )
  const file = draft.files.find((item) => fileMarker(item) === marker)
  const mention = marker.startsWith('@') ? marker.slice(1) : null
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className="bg-muted border-border/70 mx-0.5 inline-flex h-5.5 max-w-60 items-center gap-1 rounded-md border p-0.5 align-top text-xs"
    >
      {mention !== null && (
        <FilePreview
          name={mention.split('/').at(-1) ?? mention}
          load={async () => {
            if (selection === null) {
              throw new Error('No thread is open')
            }
            return loadMention(selection.machine, selection.projectId, mention)
          }}
        >
          <button
            type="button"
            title={mention}
            className="flex min-w-0 cursor-zoom-in items-center gap-1 ps-0.5"
          >
            <FileTypeIcon path={mention} className="size-3.5 shrink-0" />
            <span className="truncate">
              <span className="text-muted-foreground">@</span>
              {mention.split('/').at(-1)}
            </span>
          </button>
        </FilePreview>
      )}
      {mention === null && image === undefined && file === undefined && (
        <span className="flex min-w-0 items-center gap-1 ps-0.5">
          <HugeiconsIcon
            icon={FileIcon}
            className="text-muted-foreground size-3.5 shrink-0"
          />
          <span className="truncate">{marker}</span>
        </span>
      )}
      {image === undefined && file !== undefined && (
        <FilePreview name={file.name} load={() => loadFile(file.id, file.name)}>
          <button
            type="button"
            className="flex min-w-0 cursor-zoom-in items-center gap-1 ps-0.5"
          >
            <HugeiconsIcon
              icon={FileIcon}
              className="text-muted-foreground size-3.5 shrink-0"
            />
            <span className="truncate">{file.name}</span>
          </button>
        </FilePreview>
      )}
      {image !== undefined && (
        <FilePreview
          name={`Image #${image.number}`}
          load={async () => ({
            kind: 'image',
            src: `data:${image.mediaType};base64,${image.data}`,
          })}
        >
          <button
            type="button"
            className="flex min-w-0 cursor-zoom-in items-center gap-1"
          >
            <img
              src={`data:${image.mediaType};base64,${image.data}`}
              alt=""
              className="size-4 shrink-0 rounded-sm object-cover"
            />
            <span className="truncate">Image #{image.number}</span>
          </button>
        </FilePreview>
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
    </NodeViewWrapper>
  )
}

async function loadFile(id: string, name: string): Promise<Preview> {
  const file = await loadDraftFile(id)
  if (file === undefined) {
    throw new Error(`${name} is no longer saved, attach it again`)
  }
  const kind = mediaKind(name)
  if (kind !== null) {
    return { kind, src: `data:${file.type};base64,${await readBase64(file)}` }
  }
  const text = await file.slice(0, TEXT_READ_LIMIT).text()
  if (text.includes('\0')) {
    throw new Error('No preview for this file')
  }
  return { kind: 'text', text }
}
