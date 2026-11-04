import { getFiletypeFromFileName } from '@pierre/diffs'
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu'
import { type Editing, type Entry, parentOf } from '@/features/files/explorer'
import { useCopy } from '@/lib/clipboard'
import { downloadProjectFile } from '@/lib/media'
import { showError } from '@/lib/store'

export function ExplorerMenu(props: {
  machine: string
  projectId: string
  root: string
  entry: Entry
  onPending: (action: () => void) => void
  onPreview: (path: string) => void
  onCreate: (parent: string, folder: boolean) => void
  onEdit: (editing: Editing) => void
  onDelete: (entry: Entry) => void
}) {
  const clipboard = useCopy()

  return (
    <>
      {!props.entry.folder &&
        getFiletypeFromFileName(props.entry.path) === 'markdown' && (
          <>
            <ContextMenuItem onSelect={() => props.onPreview(props.entry.path)}>
              Open Preview
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
      <ContextMenuItem
        onSelect={() => {
          props.onPending(() =>
            props.onCreate(
              props.entry.folder
                ? props.entry.path
                : parentOf(props.entry.path),
              false
            )
          )
        }}
      >
        New File…
      </ContextMenuItem>
      <ContextMenuItem
        onSelect={() => {
          props.onPending(() =>
            props.onCreate(
              props.entry.folder
                ? props.entry.path
                : parentOf(props.entry.path),
              true
            )
          )
        }}
      >
        New Folder…
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem
        onSelect={() =>
          void clipboard.copy(
            props.entry.path === ''
              ? props.root
              : `${props.root}/${props.entry.path}`
          )
        }
      >
        Copy Path
      </ContextMenuItem>
      {props.entry.path !== '' && (
        <>
          <ContextMenuItem
            onSelect={() => void clipboard.copy(props.entry.path)}
          >
            Copy Relative Path
          </ContextMenuItem>
          {!props.entry.folder && (
            <ContextMenuItem
              onSelect={() =>
                void downloadProjectFile(
                  props.machine,
                  props.projectId,
                  props.entry.path
                ).catch(showError)
              }
            >
              Download
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() => {
              props.onPending(() =>
                props.onEdit({
                  kind: 'rename',
                  path: props.entry.path,
                  folder: props.entry.folder,
                })
              )
            }}
          >
            Rename…
          </ContextMenuItem>
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              props.onPending(() => props.onDelete(props.entry))
            }}
          >
            Delete
          </ContextMenuItem>
        </>
      )}
    </>
  )
}
