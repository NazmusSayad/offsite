import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  FileAddIcon,
  Folder01Icon,
  FolderAddIcon,
  FolderClosedIcon,
  RefreshCwIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { FileTypeIcon } from '@/components/file-icon'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { NameInput } from '@/features/files/name-input'
import { useCopy } from '@/lib/clipboard'
import { showError } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

type Folder = { folders: Map<string, Folder>; files: string[] }

type Entry = { path: string; folder: boolean }

type Editing =
  | { kind: 'create'; parent: string; folder: boolean }
  | { kind: 'rename'; path: string; folder: boolean }

export function Explorer(props: {
  machine: string
  projectId: string
  name: string
  root: string
  toggle: ReactNode
  active: string | null
  onOpen: (path: string, pinned: boolean) => void
  onRenamed: (from: string, to: string) => void
  onDeleted: (path: string) => void
}) {
  const [entries, setEntries] = useState<{
    files: string[]
    folders: string[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [expanded, setExpanded] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [menu, setMenu] = useState<Entry>({ path: '', folder: true })
  const [editing, setEditing] = useState<Editing | null>(null)
  const [deleting, setDeleting] = useState<Entry | null>(null)
  const pending = useRef<(() => void) | null>(null)
  const clipboard = useCopy()

  useEffect(() => {
    let current = true
    call(props.machine, 'files.entries', { projectId: props.projectId }).then(
      (result) => {
        if (!current) {
          return
        }
        setEntries(result)
        setError(null)
      },
      (caught: unknown) => {
        if (current) {
          setError(errorMessage(caught))
        }
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, props.projectId, version])

  const tree = useMemo(
    () => buildTree(entries?.files ?? [], entries?.folders ?? []),
    [entries]
  )
  const highlighted = selected ?? props.active
  const target =
    selected ?? (props.active === null ? '' : parentOf(props.active))

  function startCreate(parent: string, folder: boolean) {
    const parts = parent === '' ? [] : parent.split('/')
    setExpanded([
      ...new Set([
        ...expanded,
        ...parts.map((_, index) => parts.slice(0, index + 1).join('/')),
      ]),
    ])
    setEditing({ kind: 'create', parent, folder })
  }

  async function commit(value: string) {
    if (editing === null) {
      return
    }
    setEditing(null)
    const name = value.trim()
    if (name === '') {
      return
    }
    try {
      if (editing.kind === 'create') {
        const path = editing.parent === '' ? name : `${editing.parent}/${name}`
        await call(props.machine, 'files.create', {
          projectId: props.projectId,
          path,
          folder: editing.folder,
        })
        if (editing.folder) {
          setExpanded((current) => [...current, path])
        }
        if (!editing.folder) {
          props.onOpen(path, true)
        }
      }
      if (editing.kind === 'rename' && name !== baseName(editing.path)) {
        const parent = parentOf(editing.path)
        const to = parent === '' ? name : `${parent}/${name}`
        await call(props.machine, 'files.rename', {
          projectId: props.projectId,
          path: editing.path,
          to,
        })
        props.onRenamed(editing.path, to)
      }
      setVersion((current) => current + 1)
    } catch (caught) {
      showError(caught)
    }
  }

  async function remove(entry: Entry) {
    try {
      await call(props.machine, 'files.delete', {
        projectId: props.projectId,
        path: entry.path,
      })
      props.onDeleted(entry.path)
      setVersion((current) => current + 1)
    } catch (caught) {
      showError(caught)
    }
  }

  function inputRow(depth: number, folder: boolean, initial: string) {
    return (
      <div
        key="input"
        className="flex h-[22px] items-center gap-1.5 pr-2"
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <span aria-hidden className="size-4 shrink-0" />
        {folder && (
          <HugeiconsIcon
            icon={FolderClosedIcon}
            className="text-muted-foreground size-4 shrink-0"
          />
        )}
        {!folder && <FileTypeIcon path={initial} />}
        <NameInput
          initial={initial}
          onCommit={(value) => void commit(value)}
          onCancel={() => setEditing(null)}
        />
      </div>
    )
  }

  function row(path: string, depth: number, folder: boolean, open: boolean) {
    if (editing?.kind === 'rename' && editing.path === path) {
      return inputRow(depth, folder, baseName(path))
    }
    return (
      <button
        key={path}
        type="button"
        data-path={path}
        data-folder={folder}
        className={cn(
          'text-sidebar-foreground hover:bg-sidebar-row-hover focus-visible:ring-ring relative flex h-[22px] w-full cursor-pointer items-center gap-1.5 pr-2 text-left text-[13px] outline-none focus-visible:ring-1 focus-visible:ring-inset',
          path === highlighted && 'bg-sidebar-row-active'
        )}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          if (folder) {
            setSelected(path)
            setExpanded(
              open
                ? expanded.filter((item) => item !== path)
                : [...expanded, path]
            )
            return
          }
          setSelected(null)
          props.onOpen(path, false)
        }}
        onDoubleClick={() => {
          if (!folder) {
            props.onOpen(path, true)
          }
        }}
      >
        {Array.from({ length: depth }, (_, level) => (
          <span
            key={level}
            aria-hidden
            className="border-sidebar-border pointer-events-none absolute inset-y-0 border-l opacity-0 transition-opacity group-hover/tree:opacity-100"
            style={{ left: 16 + level * 12 }}
          />
        ))}
        {folder && (
          <HugeiconsIcon
            icon={ChevronRightIcon}
            aria-hidden
            className={cn(
              'text-muted-foreground size-4 shrink-0 transition-transform',
              open && 'rotate-90'
            )}
          />
        )}
        {!folder && <span aria-hidden className="size-4 shrink-0" />}
        {folder && (
          <HugeiconsIcon
            icon={open ? Folder01Icon : FolderClosedIcon}
            className="text-muted-foreground size-4 shrink-0"
          />
        )}
        {!folder && <FileTypeIcon path={path} />}
        <span className="truncate">{baseName(path)}</span>
      </button>
    )
  }

  function render(folder: Folder, parent: string, depth: number): ReactNode[] {
    return [
      editing?.kind === 'create' &&
        editing.parent === parent &&
        inputRow(depth, editing.folder, ''),
      ...[...folder.folders]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map((entry) => {
          const path = parent === '' ? entry[0] : `${parent}/${entry[0]}`
          const open = expanded.includes(path)
          return (
            <div key={`dir:${path}`}>
              {row(path, depth, true, open)}
              {open && render(entry[1], path, depth + 1)}
            </div>
          )
        }),
      ...[...folder.files]
        .sort((left, right) => left.localeCompare(right))
        .map((file) => row(file, depth, false, false)),
    ]
  }

  return (
    <div className="bg-sidebar flex h-full min-h-0 flex-col">
      <div className="text-sidebar-foreground border-sidebar-border flex h-9 shrink-0 items-center gap-0.5 border-b px-1.5">
        {props.toggle}
        <span className="ml-1.5 min-w-0 flex-1 truncate text-[11px] font-bold tracking-wide uppercase">
          {props.name}
        </span>
        <Button
          size="icon-micro"
          variant="ghost"
          title="New File…"
          aria-label="New File"
          onClick={() => startCreate(target, false)}
        >
          <HugeiconsIcon icon={FileAddIcon} className="size-4" />
        </Button>
        <Button
          size="icon-micro"
          variant="ghost"
          title="New Folder…"
          aria-label="New Folder"
          onClick={() => startCreate(target, true)}
        >
          <HugeiconsIcon icon={FolderAddIcon} className="size-4" />
        </Button>
        <Button
          size="icon-micro"
          variant="ghost"
          title="Refresh Explorer"
          aria-label="Refresh Explorer"
          onClick={() => setVersion(version + 1)}
        >
          <HugeiconsIcon icon={RefreshCwIcon} className="size-4" />
        </Button>
        <Button
          size="icon-micro"
          variant="ghost"
          title="Collapse Folders in Explorer"
          aria-label="Collapse Folders in Explorer"
          onClick={() => setExpanded([])}
        >
          <HugeiconsIcon icon={ChevronsDownUpIcon} className="size-4" />
        </Button>
      </div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="group/tree min-h-0 flex-1 overflow-y-auto pb-6"
            onContextMenu={(event) => {
              const element =
                event.target instanceof Element
                  ? event.target.closest<HTMLElement>('[data-path]')
                  : null
              setMenu(
                element === null
                  ? { path: '', folder: true }
                  : {
                      path: element.dataset.path ?? '',
                      folder: element.dataset.folder === 'true',
                    }
              )
            }}
          >
            {error !== null && (
              <p className="text-muted-foreground p-4 text-xs">{error}</p>
            )}
            {error === null && entries === null && (
              <p className="text-muted-foreground p-4 text-xs">Loading…</p>
            )}
            {error === null && entries !== null && render(tree, '', 0)}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          className="min-w-48"
          onCloseAutoFocus={(event) => {
            if (pending.current === null) {
              return
            }
            event.preventDefault()
            pending.current()
            pending.current = null
          }}
        >
          <ContextMenuItem
            onSelect={() => {
              pending.current = () =>
                startCreate(
                  menu.folder ? menu.path : parentOf(menu.path),
                  false
                )
            }}
          >
            New File…
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              pending.current = () =>
                startCreate(menu.folder ? menu.path : parentOf(menu.path), true)
            }}
          >
            New Folder…
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() =>
              void clipboard.copy(
                menu.path === '' ? props.root : `${props.root}/${menu.path}`
              )
            }
          >
            Copy Path
          </ContextMenuItem>
          {menu.path !== '' && (
            <>
              <ContextMenuItem onSelect={() => void clipboard.copy(menu.path)}>
                Copy Relative Path
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => {
                  pending.current = () =>
                    setEditing({
                      kind: 'rename',
                      path: menu.path,
                      folder: menu.folder,
                    })
                }}
              >
                Rename…
              </ContextMenuItem>
              <ContextMenuItem
                variant="destructive"
                onSelect={() => {
                  pending.current = () => setDeleting(menu)
                }}
              >
                Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Delete '${deleting === null ? '' : baseName(deleting.path)}'?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.folder === true
                ? 'This folder and everything in it will be permanently deleted.'
                : 'This file will be permanently deleted.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleting !== null) {
                  void remove(deleting)
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function buildTree(files: string[], folders: string[]) {
  const root: Folder = { folders: new Map(), files: [] }
  function folderAt(parts: string[]) {
    let folder = root
    for (const part of parts) {
      const child = folder.folders.get(part) ?? {
        folders: new Map(),
        files: [],
      }
      folder.folders.set(part, child)
      folder = child
    }
    return folder
  }
  for (const folder of folders) {
    folderAt(folder.split('/'))
  }
  for (const file of files) {
    folderAt(file.split('/').slice(0, -1)).files.push(file)
  }
  return root
}

export function parentOf(path: string) {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}

export function baseName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1)
}
