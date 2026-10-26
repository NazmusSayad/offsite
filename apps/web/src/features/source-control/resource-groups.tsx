import {
  ChevronRightIcon,
  FileExportIcon,
  MinusSignIcon,
  PlusSignIcon,
  UndoIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { GitResource, SourceControlRepo } from '@offsite/core/git'
import { type ReactNode, useState } from 'react'
import { FileTypeIcon } from '@/components/file-icon'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { baseName, parentOf } from '@/features/files/explorer'
import {
  buildTree,
  changeTab,
  fileTab,
  type Group,
  headTab,
  type Node,
  projectFile,
  type Sort,
  sortResources,
  statusColors,
  statusNames,
  type TabSpec,
} from '@/features/source-control/changes'
import { useCopy } from '@/lib/clipboard'
import { cn } from '@/lib/utils'

const groups: { id: Group; title: string }[] = [
  { id: 'merge', title: 'Merge Changes' },
  { id: 'staged', title: 'Staged Changes' },
  { id: 'changes', title: 'Changes' },
]

export function ResourceGroups(props: {
  repo: SourceControlRepo
  root: string
  tree: boolean
  sort: Sort
  depth: number
  active: string | null
  onOpen: (spec: TabSpec, pinned: boolean) => void
  onStage: (resources: GitResource[]) => void
  onUnstage: (resources: GitResource[]) => void
  onDiscard: (resources: GitResource[]) => void
  onIgnore: (resources: GitResource[]) => void
}) {
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [menu, setMenu] = useState<{
    group: Group
    resource: GitResource
  } | null>(null)
  const clipboard = useCopy()
  const repo = props.repo

  function toggle(key: string) {
    setCollapsed(
      collapsed.includes(key)
        ? collapsed.filter((item) => item !== key)
        : [...collapsed, key]
    )
  }

  function actions(
    group: Group,
    resources: GitResource[],
    scope: 'file' | 'folder' | 'group'
  ) {
    const changes = scope === 'group' ? 'All Changes' : 'Changes'
    return (
      <>
        {scope === 'file' && resources[0].status !== 'D' && (
          <RowAction
            title="Open File"
            icon={FileExportIcon}
            onClick={() =>
              props.onOpen(
                fileTab(repo.path, projectFile(repo.path, resources[0].path)),
                true
              )
            }
          />
        )}
        {group === 'changes' && (
          <RowAction
            title={`Discard ${changes}`}
            icon={UndoIcon}
            onClick={() => props.onDiscard(resources)}
          />
        )}
        {group === 'staged' && (
          <RowAction
            title={`Unstage ${changes}`}
            icon={MinusSignIcon}
            onClick={() => props.onUnstage(resources)}
          />
        )}
        {group !== 'staged' && (
          <RowAction
            title={
              group === 'merge' && scope === 'group'
                ? 'Stage All Merge Changes'
                : `Stage ${changes}`
            }
            icon={PlusSignIcon}
            onClick={() => props.onStage(resources)}
          />
        )}
      </>
    )
  }

  function fileRow(group: Group, resource: GitResource, depth: number) {
    const spec = changeTab(repo.path, group, resource)
    const path = projectFile(repo.path, resource.path)
    return (
      <div
        key={`${group}:${resource.path}`}
        data-resource
        role="button"
        tabIndex={0}
        title={`${props.root}/${path} • ${statusNames[resource.status]}`}
        className={cn(
          'group/row hover:bg-sidebar-row-hover focus-visible:ring-ring relative flex h-[22px] cursor-pointer items-center gap-1.5 pr-2 text-[13px] outline-none select-none focus-visible:ring-1 focus-visible:ring-inset',
          spec.id === props.active && 'bg-sidebar-row-active'
        )}
        style={{ paddingLeft: 20 + depth * 8 }}
        onClick={() => props.onOpen(spec, false)}
        onDoubleClick={() => props.onOpen(spec, true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            props.onOpen(spec, true)
          }
        }}
        onContextMenu={() => setMenu({ group, resource })}
      >
        <FileTypeIcon path={resource.path} />
        <span
          className={cn(
            'min-w-0 shrink-0 truncate',
            statusColors[resource.status],
            resource.status === 'D' && 'line-through'
          )}
        >
          {baseName(resource.path)}
        </span>
        {!props.tree && (
          <span className="text-muted-foreground min-w-0 truncate text-xs">
            {parentOf(resource.path)}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          <span className="hidden items-center gap-0.5 group-hover/row:flex group-focus-visible/row:flex">
            {actions(group, [resource], 'file')}
          </span>
          <span
            className={cn(
              'w-3.5 text-center text-xs',
              statusColors[resource.status]
            )}
          >
            {resource.status}
          </span>
        </span>
      </div>
    )
  }

  function nodes(group: Group, items: Node[], depth: number): ReactNode[] {
    return items.map((node) => {
      if (node.kind === 'file') {
        return fileRow(group, node.resource, depth)
      }
      const key = `${repo.path}:${group}:${node.path}`
      const open = !collapsed.includes(key)
      return (
        <div key={key}>
          <div
            role="button"
            tabIndex={0}
            title={node.path}
            className="group/row hover:bg-sidebar-row-hover focus-visible:ring-ring relative flex h-[22px] cursor-pointer items-center gap-1.5 pr-2 text-[13px] outline-none select-none focus-visible:ring-1 focus-visible:ring-inset"
            style={{ paddingLeft: 4 + depth * 8 }}
            onClick={() => toggle(key)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                toggle(key)
              }
            }}
          >
            <Twistie open={open} />
            <span className="min-w-0 truncate">{node.label}</span>
            <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover/row:flex group-focus-visible/row:flex">
              {actions(group, node.resources, 'folder')}
            </span>
          </div>
          {open && nodes(group, node.children, depth + 1)}
        </div>
      )
    })
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onContextMenu={(event) => {
            if (
              !(event.target instanceof Element) ||
              event.target.closest('[data-resource]') === null
            ) {
              event.preventDefault()
            }
          }}
        >
          {groups.map((group) => {
            const resources = repo[group.id]
            if (resources.length === 0) {
              return null
            }
            const key = `${repo.path}:${group.id}`
            const open = !collapsed.includes(key)
            return (
              <div key={group.id}>
                <div
                  role="button"
                  tabIndex={0}
                  className="group/row hover:bg-sidebar-row-hover focus-visible:ring-ring relative flex h-[22px] cursor-pointer items-center gap-1.5 pr-2 text-[13px] outline-none select-none focus-visible:ring-1 focus-visible:ring-inset"
                  style={{ paddingLeft: 4 + props.depth * 8 }}
                  onClick={() => toggle(key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      toggle(key)
                    }
                  }}
                >
                  <Twistie open={open} />
                  <span className="min-w-0 flex-1 truncate">{group.title}</span>
                  <span className="hidden shrink-0 items-center gap-0.5 group-hover/row:flex group-focus-visible/row:flex">
                    {actions(group.id, resources, 'group')}
                  </span>
                  <span className="bg-muted text-foreground grid h-4.5 min-w-4.5 shrink-0 place-items-center rounded-full px-1 text-[11px] tabular-nums">
                    {resources.length}
                  </span>
                </div>
                {open &&
                  (props.tree
                    ? nodes(
                        group.id,
                        buildTree(resources, props.sort),
                        props.depth + 1
                      )
                    : sortResources(resources, props.sort).map((resource) =>
                        fileRow(group.id, resource, props.depth + 1)
                      ))}
              </div>
            )
          })}
        </div>
      </ContextMenuTrigger>
      {menu !== null && (
        <ContextMenuContent className="min-w-52">
          <ContextMenuItem
            onSelect={() =>
              props.onOpen(
                changeTab(repo.path, menu.group, menu.resource),
                true
              )
            }
          >
            Open Changes
          </ContextMenuItem>
          {menu.resource.status !== 'D' && (
            <ContextMenuItem
              onSelect={() =>
                props.onOpen(
                  fileTab(
                    repo.path,
                    projectFile(repo.path, menu.resource.path)
                  ),
                  true
                )
              }
            >
              Open File
            </ContextMenuItem>
          )}
          {menu.resource.status !== 'U' && menu.resource.status !== 'A' && (
            <ContextMenuItem
              onSelect={() =>
                props.onOpen(headTab(repo.path, menu.resource), true)
              }
            >
              Open File (HEAD)
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          {menu.group === 'staged' && (
            <ContextMenuItem onSelect={() => props.onUnstage([menu.resource])}>
              Unstage Changes
            </ContextMenuItem>
          )}
          {menu.group !== 'staged' && (
            <ContextMenuItem onSelect={() => props.onStage([menu.resource])}>
              Stage Changes
            </ContextMenuItem>
          )}
          {menu.group === 'changes' && (
            <ContextMenuItem onSelect={() => props.onDiscard([menu.resource])}>
              Discard Changes
            </ContextMenuItem>
          )}
          {menu.resource.status === 'U' && (
            <ContextMenuItem onSelect={() => props.onIgnore([menu.resource])}>
              Add to .gitignore
            </ContextMenuItem>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem
            onSelect={() =>
              void clipboard.copy(
                `${props.root}/${projectFile(repo.path, menu.resource.path)}`
              )
            }
          >
            Copy Path
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              void clipboard.copy(projectFile(repo.path, menu.resource.path))
            }
          >
            Copy Relative Path
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}

function Twistie(props: { open: boolean }) {
  return (
    <HugeiconsIcon
      icon={ChevronRightIcon}
      aria-hidden
      className={cn(
        'text-muted-foreground size-4 shrink-0 transition-transform',
        props.open && 'rotate-90'
      )}
    />
  )
}

export function RowAction(props: {
  title: string
  icon: IconSvgElement
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      className="text-foreground hover:bg-accent grid size-5 cursor-pointer place-items-center rounded-sm"
      onClick={(event) => {
        event.stopPropagation()
        props.onClick()
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <HugeiconsIcon icon={props.icon} className="size-4" />
    </button>
  )
}
