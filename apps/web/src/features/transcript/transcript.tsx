import {
  AlertDiamondIcon,
  GitForkIcon,
  Minimize02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Markdown } from '@/components/markdown/markdown'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { AgentLine } from '@/features/transcript/agent-pill'
import { ChangedFilesCard } from '@/features/transcript/changed-files'
import { PlanCard } from '@/features/transcript/plan-card'
import { QuestionCard } from '@/features/transcript/question-card'
import { threadTasks } from '@/features/transcript/tasks'
import { isTool, mainRows, type Row } from '@/features/transcript/timeline'
import { ContextGroup } from '@/features/transcript/tool-group'
import { Shimmer } from '@/features/transcript/tool-row'
import {
  MessageCopyButton,
  UserMessage,
} from '@/features/transcript/user-message'
import { clock, fullTime } from '@/lib/format'
import { forkFrom, loadEarlier } from '@/lib/sessions'
import {
  projectOf,
  selectedActivity,
  selectedRunning,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'

const PAGE = 30

export function Transcript(props: {
  onOpenDiff: () => void
  onOpenTask: (id: string) => void
}) {
  const selection = useStore((state) => state.selection)
  const loaded = useStore((state) => state.loaded)
  const items = useStore((state) => state.items)
  const earlier = useStore((state) => state.earlier)
  const before = useStore((state) => state.before)
  const partial = useStore((state) => state.partial)
  const requests = useStore((state) => state.requests)
  const activity = useStore(selectedActivity)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const fromBottom = useRef<number | null>(null)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [expanded, setExpanded] = useState<string[]>([])
  const [top, setTop] = useState<{ key: string; above: number } | null>(null)
  const cwd = useStore((state) =>
    selection === null
      ? ''
      : (projectOf(state, selection.machine, selection.projectId)?.path ?? '')
  )
  const running = useStore(selectedRunning)
  const sentAt = useStore((state) => state.sentAt)

  useLayoutEffect(() => {
    const element = scroller.current
    if (element === null || sentAt === 0) {
      return
    }
    pinned.current = true
    element.scrollTop = element.scrollHeight
  }, [sentAt])

  useLayoutEffect(() => {
    const element = scroller.current
    if (element !== null && pinned.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [items, partial, requests, running])

  const found = threadTasks([...earlier, ...items], activity)
  const olderRows = mainRows(earlier, cwd, false, '')
  const rows = [...olderRows, ...mainRows(items, cwd, running, partial)]
  const topIndex = rows.findIndex((row) => row.key === top?.key)
  const start = Math.max(
    0,
    topIndex === -1 ? rows.length - PAGE : topIndex - (top?.above ?? 0)
  )

  useLayoutEffect(() => {
    const element = scroller.current
    if (element !== null && fromBottom.current !== null) {
      element.scrollTop = element.scrollHeight - fromBottom.current
    }
    fromBottom.current = null
  }, [earlier, start])

  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const element = scroller.current
    if (element === null || rows.length === 0) {
      return
    }
    if (topIndex === -1) {
      setTop({ key: rows[start].key, above: 0 })
    } else {
      showMore(element)
    }
  })

  function showMore(element: HTMLDivElement) {
    if (start === 0 || element.scrollTop >= element.clientHeight) {
      return
    }
    fromBottom.current = element.scrollHeight - element.scrollTop
    setTop({ key: rows[start].key, above: PAGE })
  }

  function toggle(key: string) {
    setExpanded(
      expanded.includes(key)
        ? expanded.filter((item) => item !== key)
        : [...expanded, key]
    )
  }

  return (
    <div
      ref={scroller}
      className="topbar-scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-8 sm:px-12"
      onScroll={(event) => {
        const element = event.currentTarget
        pinned.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 40
        showMore(element)
      }}
    >
      <div className="mx-auto w-full max-w-(--chat-content-max-width) pt-3">
        {!loaded && (
          <p className="text-muted-foreground py-6 text-center text-xs">
            Loading…
          </p>
        )}
        {before !== null && start === 0 && (
          <div className="flex justify-center pb-4">
            <Button
              type="button"
              size="xs"
              variant="ghost-muted"
              disabled={loadingEarlier}
              onClick={async () => {
                const element = scroller.current
                if (element !== null) {
                  fromBottom.current = element.scrollHeight - element.scrollTop
                }
                setTop({ key: rows[0].key, above: PAGE })
                setLoadingEarlier(true)
                await loadEarlier()
                setLoadingEarlier(false)
              }}
            >
              {loadingEarlier ? 'Loading…' : 'Load earlier conversation'}
            </Button>
          </div>
        )}
        {rows.slice(start).map((row, offset) => {
          const index = start + offset
          const previous = rows[index - 1]
          const older = index < olderRows.length
          return (
            <div
              key={row.key}
              className={cn(
                previous === undefined
                  ? undefined
                  : row.kind === 'user'
                    ? 'pt-6'
                    : row.kind === 'working'
                      ? undefined
                      : isTool(row) && isTool(previous)
                        ? 'pt-2'
                        : isTool(row) || isTool(previous)
                          ? 'pt-3'
                          : 'pt-4',
                row.kind === 'assistant' && 'group/assistant'
              )}
            >
              <RowView
                row={row}
                agents={found.agents}
                tasks={found.tasks}
                running={running}
                fork={!older}
                expanded={expanded.includes(row.key)}
                onToggle={() => toggle(row.key)}
                onOpenTask={props.onOpenTask}
                rewind={!older}
                onOpenDiff={props.onOpenDiff}
                cwd={cwd}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function RowView(props: {
  row: Row
  agents: ReturnType<typeof threadTasks>['agents']
  tasks: ReturnType<typeof threadTasks>['tasks']
  cwd: string
  running: boolean
  fork: boolean
  expanded: boolean
  onToggle: () => void
  onOpenTask: (id: string) => void
  rewind: boolean
  onOpenDiff: () => void
}) {
  const row = props.row
  switch (row.kind) {
    case 'user':
      return (
        <UserMessage
          item={row.item}
          first={row.first}
          running={props.running}
          rewind={props.rewind}
        />
      )
    case 'working':
      return (
        <div className="text-muted-foreground h-9 pt-3 text-[13px] leading-5 font-medium tracking-[-0.04px]">
          <Shimmer text="Working" active />
        </div>
      )
    case 'group':
      return (
        <ContextGroup
          entries={row.entries}
          cwd={props.cwd}
          live={row.live}
          open={props.expanded}
          onToggle={props.onToggle}
        />
      )
    case 'agent':
      return (
        <AgentLine
          item={row.item}
          agents={props.agents}
          tasks={props.tasks}
          sending={row.live && row.item.status === 'running'}
          onOpen={props.onOpenTask}
        />
      )
    case 'assistant':
      return (
        <>
          <div className="relative min-w-0">
            <Markdown
              text={
                row.text === '' && !row.streaming
                  ? '(empty response)'
                  : row.text
              }
              streaming={row.streaming}
            />
            {row.changed.size > 0 && (
              <ChangedFilesCard
                files={row.changed}
                onOpenDiff={props.onOpenDiff}
              />
            )}
          </div>
          {row.meta && (
            <div className="mt-1.5 flex items-center gap-2 text-xs tabular-nums opacity-0 transition-opacity duration-200 group-hover/assistant:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
              <MessageCopyButton text={row.text} />
              {props.fork && <ForkButton uuid={row.message} />}
              {row.time !== null && (
                <Tooltip label={fullTime(row.time)}>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {clock(row.time)}
                  </p>
                </Tooltip>
              )}
            </div>
          )}
        </>
      )
    case 'error':
      return (
        <div className="text-destructive flex gap-1.5 text-[13px] leading-5 tracking-[-0.04px]">
          <HugeiconsIcon
            icon={AlertDiamondIcon}
            className="mt-0.5 size-4 shrink-0"
          />
          <p className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-wrap select-text">
            {row.text}
          </p>
        </div>
      )
    case 'notice':
      return (
        <div className="text-muted-foreground mx-auto flex w-full max-w-(--chat-content-max-width) items-center gap-3 py-1 text-xs">
          <span className="bg-border/70 h-px flex-1" />
          <span className="flex items-center gap-1.5">
            {row.text === 'Conversation compacted' && (
              <HugeiconsIcon icon={Minimize02Icon} className="size-3" />
            )}
            {row.text}
          </span>
          <span className="bg-border/70 h-px flex-1" />
        </div>
      )
    case 'plan':
      return (
        <div className="min-w-0">
          <PlanCard plan={row.plan} />
        </div>
      )
    case 'question':
      return <QuestionCard item={row.item} />
  }
}

function ForkButton(props: { uuid: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Tooltip label="Fork from this response">
      <Button
        type="button"
        size="icon-xs"
        variant="ghost-muted"
        disabled={busy}
        aria-label="Fork from this response"
        onClick={() => {
          setBusy(true)
          void forkFrom(props.uuid).finally(() => setBusy(false))
        }}
      >
        <HugeiconsIcon
          icon={GitForkIcon}
          className={cn('size-3.5', busy && 'animate-pulse')}
        />
      </Button>
    </Tooltip>
  )
}
