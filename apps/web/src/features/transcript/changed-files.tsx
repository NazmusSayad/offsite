import {
  ChevronRightIcon,
  ChevronsDownUpIcon,
  FileDiffIcon,
  Folder01Icon,
  FolderClosedIcon,
  UnfoldMoreIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { sumBy } from 'es-toolkit'
import { type ReactNode, useState } from 'react'
import { FileTypeIcon } from '@/components/file-icon'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import type { Stat } from '@/features/transcript/timeline'
import { compact as compactCount } from '@/lib/format'
import { cn } from '@/lib/utils'

type TreeNode =
  | {
      kind: 'directory'
      name: string
      path: string
      stat: Stat
      children: TreeNode[]
    }
  | { kind: 'file'; name: string; path: string; stat: Stat }

type MutableDirectory = {
  name: string
  path: string
  stat: Stat
  directories: Map<string, MutableDirectory>
  files: TreeNode[]
}

function buildTree(files: Map<string, Stat>) {
  const root: MutableDirectory = {
    name: '',
    path: '',
    stat: { added: 0, removed: 0 },
    directories: new Map(),
    files: [],
  }
  for (const [file, stat] of files) {
    const segments = file
      .replaceAll('\\', '/')
      .split('/')
      .filter((segment) => segment !== '')
    const name = segments.at(-1)
    if (name === undefined) continue
    const ancestors = [root]
    let current = root
    for (const segment of segments.slice(0, -1)) {
      const existing = current.directories.get(segment)
      const next = existing ?? {
        name: segment,
        path: current.path === '' ? segment : `${current.path}/${segment}`,
        stat: { added: 0, removed: 0 },
        directories: new Map(),
        files: [],
      }
      current.directories.set(segment, next)
      current = next
      ancestors.push(current)
    }
    current.files.push({ kind: 'file', name, path: segments.join('/'), stat })
    for (const ancestor of ancestors) {
      ancestor.stat.added += stat.added
      ancestor.stat.removed += stat.removed
    }
  }
  return treeNodes(root)
}

function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function treeNodes(directory: MutableDirectory): TreeNode[] {
  const directories = [...directory.directories.values()]
    .sort(byName)
    .map((child) =>
      compact({
        kind: 'directory',
        name: child.name,
        path: child.path,
        stat: { ...child.stat },
        children: treeNodes(child),
      })
    )
  return [...directories, ...[...directory.files].sort(byName)]
}

function compact(node: Extract<TreeNode, { kind: 'directory' }>) {
  let current = node
  while (
    current.children.length === 1 &&
    current.children[0].kind === 'directory'
  ) {
    const child = current.children[0]
    current = {
      kind: 'directory',
      name: `${current.name}/${child.name}`,
      path: child.path,
      stat: child.stat,
      children: child.children,
    }
  }
  return current
}

export function ChangedFilesCard(props: {
  files: Map<string, Stat>
  onOpenDiff: () => void
}) {
  const [allExpanded, setAllExpanded] = useState(false)
  const files = [...props.files]
  const added = sumBy(files, (file) => file[1].added)
  const removed = sumBy(files, (file) => file[1].removed)
  const hasDirectories = files.some(([file]) => /[/\\]/.test(file))
  const toggleLabel = allExpanded
    ? 'Collapse all folders'
    : 'Expand all folders'
  return (
    <div className="bg-secondary dark:bg-input/20 @container/changed-files mt-4 rounded-lg">
      <div className="bg-secondary dark:bg-background dark:from-input/20 dark:to-input/20 sticky top-2 z-10 flex items-center justify-between gap-2 rounded-t-lg px-3 py-2 dark:bg-linear-to-b">
        <div className="text-foreground flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
          <span>
            {files.length} changed file{files.length === 1 ? '' : 's'}
          </span>
          {(added > 0 || removed > 0) && (
            <DiffStatLabel
              added={added}
              removed={removed}
              layout="inline"
              className="text-xs leading-4"
            />
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasDirectories && (
            <Tooltip label={toggleLabel}>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost-muted"
                aria-label={toggleLabel}
                onClick={() => setAllExpanded(!allExpanded)}
              >
                <HugeiconsIcon
                  icon={allExpanded ? ChevronsDownUpIcon : UnfoldMoreIcon}
                  className="size-3"
                />
              </Button>
            </Tooltip>
          )}
          <Tooltip label="Open the full diff">
            <Button
              type="button"
              size="xs"
              variant="ghost-muted"
              aria-label="Open diff"
              onClick={props.onOpenDiff}
            >
              <HugeiconsIcon icon={FileDiffIcon} className="size-3" />
              <span className="hidden @[24rem]/changed-files:inline">
                Open diff
              </span>
            </Button>
          </Tooltip>
        </div>
      </div>
      <ChangedFilesTree
        key={String(allExpanded)}
        files={props.files}
        allExpanded={allExpanded}
        onOpenDiff={props.onOpenDiff}
      />
    </div>
  )
}

function ChangedFilesTree(props: {
  files: Map<string, Stat>
  allExpanded: boolean
  onOpenDiff: () => void
}) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const nodes = buildTree(props.files)
  const hasDirectories = nodes.some((node) => node.kind === 'directory')
  const rowClass =
    'group hover:bg-accent/60 focus-visible:ring-ring focus-visible:ring-offset-background flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none focus-visible:ring-inset'
  function render(node: TreeNode, depth: number): ReactNode {
    const paddingLeft = `${8 + depth * 14}px`
    if (node.kind === 'directory') {
      const open = overrides[node.path] ?? props.allExpanded
      return (
        <div key={`dir:${node.path}`}>
          <button
            type="button"
            aria-expanded={open}
            className={rowClass}
            style={{ paddingLeft }}
            onClick={() => setOverrides({ ...overrides, [node.path]: !open })}
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
            <span className="text-2xs text-muted-foreground/90 group-hover:text-foreground/90 truncate font-mono">
              {node.name}
            </span>
            {(node.stat.added > 0 || node.stat.removed > 0) && (
              <span className="text-3xs ml-auto shrink-0 font-mono tabular-nums">
                <DiffStatLabel
                  added={node.stat.added}
                  removed={node.stat.removed}
                  layout="aligned"
                />
              </span>
            )}
          </button>
          {open && (
            <div>{node.children.map((child) => render(child, depth + 1))}</div>
          )}
        </div>
      )
    }
    return (
      <button
        key={`file:${node.path}`}
        type="button"
        className={rowClass}
        style={{ paddingLeft }}
        onClick={props.onOpenDiff}
      >
        {(hasDirectories || depth > 0) && (
          <span aria-hidden className="size-3.5 shrink-0" />
        )}
        <FileTypeIcon
          path={node.path}
          className="text-muted-foreground/70 size-3.5"
        />
        <span className="text-foreground/85 group-hover:text-foreground flex min-w-0 font-mono text-xs">
          <span className="truncate">{node.name}</span>
        </span>
        <span className="text-3xs ml-auto shrink-0 font-mono tabular-nums">
          <DiffStatLabel
            added={node.stat.added}
            removed={node.stat.removed}
            layout="aligned"
          />
        </span>
      </button>
    )
  }
  return <div className="p-2">{nodes.map((node) => render(node, 0))}</div>
}

export function DiffStatLabel(props: {
  added: number
  removed: number
  layout: 'aligned' | 'inline'
  className?: string
}) {
  return (
    <span
      role="group"
      aria-label={`${props.added} additions, ${props.removed} deletions`}
      className={cn(
        props.layout === 'inline'
          ? 'inline-flex items-center gap-1 align-middle tabular-nums'
          : 'inline-grid grid-cols-[4ch_4ch] gap-2 text-right align-middle tabular-nums',
        props.className
      )}
    >
      <span aria-hidden className="text-diff-addition font-mono">
        +{compactCount(props.added)}
      </span>
      <span aria-hidden className="text-diff-deletion font-mono">
        -{compactCount(props.removed)}
      </span>
    </span>
  )
}
