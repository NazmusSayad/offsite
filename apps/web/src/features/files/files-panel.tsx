import {
  ChevronRightIcon,
  Folder01Icon,
  FolderClosedIcon,
  RefreshCwIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { call } from '@/api/connection'
import { FileTypeIcon } from '@/components/file-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FilePreview } from '@/features/files/file-preview'
import { cn, errorMessage } from '@/lib/utils'

type Folder = { folders: Map<string, Folder>; files: string[] }

const MATCH_LIMIT = 200

export function FilesPanel(props: {
  machine: string
  projectId: string
  onClose: () => void
}) {
  const [files, setFiles] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [expanded, setExpanded] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    call(props.machine, 'files.list', { projectId: props.projectId }).then(
      (list) => {
        if (!current) return
        setFiles(list)
        setError(null)
      },
      (caught: unknown) => {
        if (current) setError(errorMessage(caught))
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, props.projectId, version])

  const tree = useMemo(() => buildTree(files ?? []), [files])
  const search = query.trim().toLowerCase()
  const matches =
    search === ''
      ? []
      : (files ?? []).filter((file) => file.toLowerCase().includes(search))
  const rowClass =
    'group hover:bg-accent/60 focus-visible:ring-ring flex w-full cursor-pointer items-center gap-2 rounded-md py-1 pr-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset'

  function render(folder: Folder, prefix: string, depth: number): ReactNode[] {
    const paddingLeft = `${8 + depth * 14}px`
    return [
      ...[...folder.folders]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map((entry) => {
          const path = `${prefix}${entry[0]}`
          const open = expanded.includes(path)
          return (
            <div key={`dir:${path}`}>
              <button
                type="button"
                aria-expanded={open}
                className={rowClass}
                style={{ paddingLeft }}
                onClick={() =>
                  setExpanded(
                    open
                      ? expanded.filter((item) => item !== path)
                      : [...expanded, path]
                  )
                }
              >
                <HugeiconsIcon
                  icon={ChevronRightIcon}
                  aria-hidden
                  className={cn(
                    'text-muted-foreground/70 group-hover:text-foreground/80 size-3.5 shrink-0 transition-transform',
                    open && 'rotate-90'
                  )}
                />
                <HugeiconsIcon
                  icon={open ? Folder01Icon : FolderClosedIcon}
                  className="text-muted-foreground/75 size-3.5 shrink-0"
                />
                <span className="text-foreground/85 group-hover:text-foreground truncate font-mono text-xs">
                  {entry[0]}
                </span>
              </button>
              {open && render(entry[1], `${path}/`, depth + 1)}
            </div>
          )
        }),
      ...[...folder.files]
        .sort((left, right) => left.localeCompare(right))
        .map((file) => (
          <button
            key={`file:${file}`}
            type="button"
            className={rowClass}
            style={{ paddingLeft }}
            onClick={() => setPreview(file)}
          >
            <span aria-hidden className="size-3.5 shrink-0" />
            <FileTypeIcon path={file} className="size-3.5" />
            <span className="text-foreground/85 group-hover:text-foreground truncate font-mono text-xs">
              {file.slice(prefix.length)}
            </span>
          </button>
        )),
    ]
  }

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center justify-between gap-2 border-b pr-39 pl-3">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            title="Close"
            aria-label="Close"
            onClick={props.onClose}
          >
            <HugeiconsIcon icon={XIcon} className="size-3.5" />
          </Button>
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            Files
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            title="Refresh files"
            aria-label="Refresh files"
            onClick={() => setVersion(version + 1)}
          >
            <HugeiconsIcon icon={RefreshCwIcon} className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="shrink-0 p-2 pb-0">
        <Input
          className="h-7"
          placeholder="Filter files"
          aria-label="Filter files"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error !== null && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            {error}
          </p>
        )}
        {error === null && files === null && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            Loading…
          </p>
        )}
        {error === null && files?.length === 0 && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            No files in this project.
          </p>
        )}
        {error === null && search === '' && render(tree, '', 0)}
        {error === null && search !== '' && matches.length === 0 && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            No matching files.
          </p>
        )}
        {error === null &&
          matches.slice(0, MATCH_LIMIT).map((file) => (
            <button
              key={file}
              type="button"
              className={cn(rowClass, 'pl-2')}
              title={file}
              onClick={() => setPreview(file)}
            >
              <FileTypeIcon path={file} className="size-3.5" />
              <span className="text-foreground/85 group-hover:text-foreground truncate font-mono text-xs">
                {file}
              </span>
            </button>
          ))}
        {error === null && matches.length > MATCH_LIMIT && (
          <p className="text-muted-foreground p-2 text-center text-xs">
            Showing {MATCH_LIMIT} of {matches.length} matches.
          </p>
        )}
      </div>
      <FilePreview
        machine={props.machine}
        projectId={props.projectId}
        path={preview}
        onClose={() => setPreview(null)}
      />
    </div>
  )
}

function buildTree(files: string[]) {
  const root: Folder = { folders: new Map(), files: [] }
  for (const file of files) {
    const parts = file.split('/')
    let folder = root
    for (const part of parts.slice(0, -1)) {
      const child = folder.folders.get(part) ?? {
        folders: new Map(),
        files: [],
      }
      folder.folders.set(part, child)
      folder = child
    }
    folder.files.push(file)
  }
  return root
}
