import {
  ChevronRightIcon,
  CloudDownloadIcon,
  CloudIcon,
  GitBranchIcon,
  RefreshCwIcon,
  Tag01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  GitCommit,
  GitResource,
  SourceControlRepo,
} from '@offsite/core/git'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { FileTypeIcon } from '@/components/file-icon'
import { baseName, parentOf } from '@/features/files/explorer'
import {
  commitTab,
  shortHash,
  statusColors,
  statusNames,
  type TabSpec,
} from '@/features/source-control/changes'
import { RowAction } from '@/features/source-control/resource-groups'
import { showError } from '@/lib/store'
import { cn, drag, errorMessage } from '@/lib/utils'

const PAGE = 50
const LANE = 11
const HEIGHT = 22
const colors = [
  '#59A4F9',
  '#FFB000',
  '#DC267F',
  '#994F00',
  '#40B0A6',
  '#B66DFF',
]

type Row = {
  commit: GitCommit
  lane: number
  up: number[]
  through: number[]
  down: number[]
  after: number[]
  width: number
}

export function Graph(props: {
  machine: string
  projectId: string
  repos: SourceControlRepo[]
  open: boolean
  height: number
  active: string | null
  onToggle: () => void
  onHeight: (height: number) => void
  onOpen: (spec: TabSpec, pinned: boolean) => void
  onFetch: (repo: SourceControlRepo) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [commits, setCommits] = useState<GitCommit[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [limit, setLimit] = useState(PAGE)
  const [version, setVersion] = useState(0)
  const [expanded, setExpanded] = useState<string[]>([])
  const [files, setFiles] = useState<Record<string, GitResource[]>>({})
  const repo =
    props.repos.find((item) => item.path === selected) ?? props.repos.at(0)
  const repoPath = repo?.path ?? null
  const head = repo?.head ?? null
  const upstream = repo?.upstream ?? null
  const behind = repo?.behind ?? 0

  useEffect(() => {
    if (repoPath === null || head === null) {
      setCommits([])
      return
    }
    let current = true
    call(props.machine, 'git.history', {
      projectId: props.projectId,
      repo: repoPath,
      limit,
    }).then(
      (result) => {
        if (current) {
          setCommits(result)
          setError(null)
        }
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
  }, [
    props.machine,
    props.projectId,
    repoPath,
    head,
    upstream,
    behind,
    limit,
    version,
  ])

  async function expand(commit: GitCommit) {
    if (expanded.includes(commit.hash)) {
      setExpanded(expanded.filter((hash) => hash !== commit.hash))
      return
    }
    setExpanded([...expanded, commit.hash])
    if (repo === undefined || files[commit.hash] !== undefined) {
      return
    }
    try {
      const result = await call(props.machine, 'git.commitFiles', {
        projectId: props.projectId,
        repo: repo.path,
        hash: commit.hash,
        parent: commit.parents.at(0) ?? null,
      })
      setFiles((current) => ({ ...current, [commit.hash]: result }))
    } catch (caught) {
      showError(caught)
    }
  }

  const rows = layout(commits ?? [])

  return (
    <div
      className={cn(
        'border-sidebar-border relative flex shrink-0 flex-col border-t',
        props.open && 'min-h-20'
      )}
      style={props.open ? { height: props.height } : undefined}
    >
      {props.open && (
        <div
          role="separator"
          aria-orientation="horizontal"
          className="hover:bg-primary absolute inset-x-0 -top-0.5 z-10 h-1 cursor-row-resize touch-none transition-colors delay-100"
          onPointerDown={(event) => {
            const parent = event.currentTarget.parentElement?.parentElement
            if (parent === null || parent === undefined) {
              return
            }
            const bounds = parent.getBoundingClientRect()
            drag(event, (move) =>
              props.onHeight(
                Math.min(
                  Math.max(bounds.bottom - move.clientY, 80),
                  bounds.height - 120
                )
              )
            )
          }}
        />
      )}
      <div
        role="button"
        tabIndex={0}
        className="group/row text-sidebar-foreground flex h-[22px] shrink-0 cursor-pointer items-center gap-0.5 pr-2 pl-0.5 outline-none select-none"
        onClick={props.onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            props.onToggle()
          }
        }}
      >
        <HugeiconsIcon
          icon={ChevronRightIcon}
          aria-hidden
          className={cn(
            'size-4 shrink-0 transition-transform',
            props.open && 'rotate-90'
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[11px] font-bold tracking-wide uppercase">
          Graph
        </span>
        {props.repos.length > 1 && (
          <select
            aria-label="Repository"
            value={repo?.path ?? ''}
            className="bg-sidebar text-muted-foreground max-w-28 cursor-pointer truncate text-xs outline-none"
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => {
              setSelected(event.target.value)
              setExpanded([])
              setLimit(PAGE)
            }}
          >
            {props.repos.map((item) => (
              <option key={item.path} value={item.path}>
                {item.path === '' ? '.' : item.path}
              </option>
            ))}
          </select>
        )}
        {props.open && repo !== undefined && (
          <span className="hidden items-center gap-0.5 group-hover/row:flex">
            <RowAction
              title="Fetch From All Remotes"
              icon={CloudDownloadIcon}
              onClick={() => props.onFetch(repo)}
            />
            <RowAction
              title="Refresh"
              icon={RefreshCwIcon}
              onClick={() => setVersion(version + 1)}
            />
          </span>
        )}
      </div>
      {props.open && (
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {error !== null && (
            <p className="text-muted-foreground px-4 py-1 text-xs">{error}</p>
          )}
          {error === null && rows.length === 0 && commits !== null && (
            <p className="text-muted-foreground px-4 py-1 text-xs">
              No commits yet.
            </p>
          )}
          {error === null &&
            repo !== undefined &&
            rows.map((row) => {
              const commit = row.commit
              const open = expanded.includes(commit.hash)
              return (
                <div key={commit.hash}>
                  <div
                    role="button"
                    tabIndex={0}
                    title={`${commit.author}, ${new Date(commit.date).toLocaleString()}\n\n${commit.subject}\n\n${shortHash(commit.hash)}`}
                    className="hover:bg-sidebar-row-hover flex h-[22px] cursor-pointer items-center gap-1.5 pr-2 text-[13px] outline-none select-none"
                    onClick={() => void expand(commit)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        void expand(commit)
                      }
                    }}
                  >
                    <Lanes row={row} child={false} />
                    <span className="min-w-0 truncate">{commit.subject}</span>
                    <span className="text-muted-foreground min-w-0 shrink-[2] truncate text-xs">
                      {commit.author}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {commit.refs.map((ref) => badge(ref, repo))}
                    </span>
                  </div>
                  {open &&
                    (files[commit.hash] ?? []).map((resource) => {
                      const spec = commitTab(repo.path, commit, resource)
                      return (
                        <div
                          key={resource.path}
                          role="button"
                          tabIndex={0}
                          title={`${resource.path} • ${statusNames[resource.status]}`}
                          className={cn(
                            'hover:bg-sidebar-row-hover flex h-[22px] cursor-pointer items-center gap-1.5 pr-2 text-[13px] outline-none select-none',
                            spec.id === props.active && 'bg-sidebar-row-active'
                          )}
                          onClick={() => props.onOpen(spec, false)}
                          onDoubleClick={() => props.onOpen(spec, true)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              props.onOpen(spec, true)
                            }
                          }}
                        >
                          <Lanes row={row} child />
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
                          <span className="text-muted-foreground min-w-0 truncate text-xs">
                            {parentOf(resource.path)}
                          </span>
                          <span
                            className={cn(
                              'ml-auto w-3.5 shrink-0 text-center text-xs',
                              statusColors[resource.status]
                            )}
                          >
                            {resource.status}
                          </span>
                        </div>
                      )
                    })}
                </div>
              )
            })}
          {commits !== null && commits.length === limit && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground w-full cursor-pointer px-4 py-1 text-left text-xs"
              onClick={() => setLimit(limit + PAGE)}
            >
              Load More…
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Lanes(props: { row: Row; child: boolean }) {
  const row = props.row
  const center = HEIGHT / 2
  const dot = x(row.lane)
  if (props.child) {
    return (
      <svg
        aria-hidden
        width={LANE * (row.width + 1)}
        height={HEIGHT}
        className="shrink-0"
      >
        {row.after.map((lane) => (
          <line
            key={lane}
            x1={x(lane)}
            x2={x(lane)}
            y1={0}
            y2={HEIGHT}
            stroke={color(lane)}
            strokeWidth={1}
          />
        ))}
      </svg>
    )
  }
  return (
    <svg
      aria-hidden
      width={LANE * (row.width + 1)}
      height={HEIGHT}
      className="shrink-0"
    >
      {row.through.map((lane) => (
        <line
          key={`through-${lane}`}
          x1={x(lane)}
          x2={x(lane)}
          y1={0}
          y2={HEIGHT}
          stroke={color(lane)}
          strokeWidth={1}
        />
      ))}
      {row.up.map((lane) => (
        <path
          key={`up-${lane}`}
          d={`M ${x(lane)} 0 Q ${x(lane)} ${center} ${dot} ${center}`}
          fill="none"
          stroke={color(lane)}
          strokeWidth={1}
        />
      ))}
      {row.down.map((lane) => (
        <path
          key={`down-${lane}`}
          d={`M ${dot} ${center} Q ${x(lane)} ${center} ${x(lane)} ${HEIGHT}`}
          fill="none"
          stroke={color(lane)}
          strokeWidth={1}
        />
      ))}
      <circle
        cx={dot}
        cy={center}
        r={row.commit.parents.length > 1 ? 3.5 : 4}
        fill={
          row.commit.parents.length > 1 ? 'var(--sidebar)' : color(row.lane)
        }
        stroke={color(row.lane)}
        strokeWidth={row.commit.parents.length > 1 ? 2 : 0}
      />
    </svg>
  )
}

function badge(ref: string, repo: SourceControlRepo) {
  if (ref.endsWith('/HEAD')) {
    return null
  }
  const head = ref === 'HEAD' || ref.startsWith('HEAD -> ')
  const tag = ref.startsWith('tag: ')
  const remote = ref === repo.upstream
  const name = ref.replace(/^HEAD -> /, '').replace(/^tag: /, '')
  return (
    <span
      key={ref}
      title={name}
      className={cn(
        'inline-flex h-4 max-w-32 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-medium',
        head && 'text-background bg-[#59A4F9]',
        remote && 'text-background bg-[#B180D7]',
        !head && !remote && 'bg-muted text-foreground'
      )}
    >
      <HugeiconsIcon
        icon={tag ? Tag01Icon : remote ? CloudIcon : GitBranchIcon}
        className="size-3 shrink-0"
      />
      <span className="truncate">{name}</span>
    </span>
  )
}

function x(lane: number) {
  return LANE * (lane + 1)
}

function color(lane: number) {
  return colors[lane % colors.length]
}

function layout(commits: GitCommit[]) {
  let lanes: (string | null)[] = []
  return commits.map((commit): Row => {
    const top = lanes
    const found = top.indexOf(commit.hash)
    const free = top.indexOf(null)
    const lane = found !== -1 ? found : free !== -1 ? free : top.length
    const next = top.map((hash) => (hash === commit.hash ? null : hash))
    next[lane] = commit.parents.at(0) ?? null
    const down = commit.parents.length > 0 ? [lane] : []
    for (const parent of commit.parents.slice(1)) {
      const existing = next.indexOf(parent)
      if (existing !== -1) {
        down.push(existing)
        continue
      }
      const slot = next.indexOf(null)
      const target = slot === -1 ? next.length : slot
      next[target] = parent
      down.push(target)
    }
    while (next.length > 0 && next.at(-1) === null) {
      next.pop()
    }
    lanes = next
    return {
      commit,
      lane,
      up: top.flatMap((hash, index) => (hash === commit.hash ? [index] : [])),
      through: top.flatMap((hash, index) =>
        hash !== null && hash !== commit.hash ? [index] : []
      ),
      down,
      after: next.flatMap((hash, index) => (hash === null ? [] : [index])),
      width: Math.max(top.length, next.length, lane + 1),
    }
  })
}
