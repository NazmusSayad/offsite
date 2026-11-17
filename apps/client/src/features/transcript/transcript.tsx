import { AlertDiamondIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { LegendList, type LegendListRef } from '@legendapp/list/react'
import { isEqual, omit } from 'es-toolkit'
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useShallow } from 'zustand/shallow'
import { Markdown } from '@/components/markdown/markdown'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Wrapper } from '@/components/wrapper'
import { AgentLine, ReceivedMessage } from '@/features/transcript/agent-pill'
import {
  MessageBookmarkButton,
  useBookmarks,
} from '@/features/transcript/bookmarks'
import { CompactionRow } from '@/features/transcript/compaction-row'
import { ThreadFindBar } from '@/features/transcript/find-bar'
import { ForkButton } from '@/features/transcript/fork-button'
import { scrollToEnd, scrollToRow } from '@/features/transcript/list-scroll'
import { PlanCard } from '@/features/transcript/plan-card'
import { QuestionCard } from '@/features/transcript/question-card'
import { QuoteButton } from '@/features/transcript/quote-button'
import { ResumeButton } from '@/features/transcript/resume-button'
import { useSelectedRows } from '@/features/transcript/selected-rows'
import { threadTasks } from '@/features/transcript/tasks'
import {
  isTool,
  liveRows,
  mainRows,
  type Row,
} from '@/features/transcript/timeline'
import { ContextGroup } from '@/features/transcript/tool-group'
import { Shimmer } from '@/features/transcript/tool-row'
import { TurnJumper } from '@/features/transcript/turn-jumper'
import {
  MessageCopyButton,
  UserMessage,
} from '@/features/transcript/user-message'
import { clock, fullTime } from '@/lib/format'
import { selectedPrompts } from '@/lib/outbox'
import { loadEarlier } from '@/lib/sessions'
import {
  placePathOf,
  selectedActivity,
  selectedRunning,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'

const followEnd = {
  animated: false,
  on: { dataChange: true, footerLayout: false, itemLayout: true, layout: true },
}

const followEndSmooth = { ...followEnd, animated: true }

function TranscriptView(props: { onOpenTask: (id: string) => void }) {
  const selection = useStore((state) => state.selection)
  const loaded = useStore((state) => state.loaded)
  const items = useStore((state) => state.items)
  const earlier = useStore((state) => state.earlier)
  const before = useStore((state) => state.before)
  const partial = useStore((state) => state.partial)
  const prompts = useStore(useShallow(selectedPrompts))
  const activity = useStore(selectedActivity)
  const list = useRef<LegendListRef>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [expanded, setExpanded] = useState<string[]>([])
  const [finding, setFinding] = useState(false)
  const [settled, setSettled] = useState(false)
  const cwd = useStore((state) =>
    selection === null
      ? ''
      : (placePathOf(
          state,
          selection.machine,
          selection.projectId,
          selection.worktreeId
        ) ?? '')
  )
  const running = useStore(selectedRunning)
  const sentAt = useStore((state) => state.sentAt)

  useLayoutEffect(() => {
    if (list.current === null || sentAt === 0) {
      return
    }
    void scrollToEnd(list.current)
  }, [sentAt])

  useLayoutEffect(() => {
    if (!loaded) {
      setSettled(false)
      return
    }
    if (list.current === null) {
      throw new Error('transcript is not mounted')
    }
    void scrollToEnd(list.current).then(() => setSettled(true))
  }, [loaded])

  const found = useMemo(
    () => threadTasks([...earlier, ...items], activity),
    [earlier, items, activity]
  )
  const olderRows = mainRows(earlier, false, '')
  const sending =
    !running &&
    prompts.some(
      (prompt) => prompt.status === 'sending' || prompt.status === 'accepted'
    )
  const rows = [
    ...olderRows,
    ...liveRows(items, loaded ? prompts : [], running, sending, partial),
  ]
  const selected = useSelectedRows(scroller)
  const firstSelected = rows.findIndex((row) => row.key === selected?.first)
  const lastSelected = rows.findIndex((row) => row.key === selected?.last)

  useHotkeys(
    'mod+f',
    (event) => {
      const target = event.target
      if (
        event.defaultPrevented ||
        (target instanceof Element &&
          target !== document.body &&
          target.closest('[data-composer], [data-transcript]') === null)
      ) {
        return
      }
      event.preventDefault()
      setFinding(true)
      requestAnimationFrame(() =>
        document.querySelector<HTMLInputElement>('[data-thread-find]')?.select()
      )
    },
    { enableOnFormTags: true, enableOnContentEditable: true }
  )

  async function jump(key: string) {
    const row = rows.find((candidate) => candidate.key === key)
    if (list.current === null || row === undefined) {
      throw new Error('that message is not loaded')
    }
    await list.current.scrollToKey({
      key: listKey(row),
      animated: false,
      viewOffset: 24,
    })
    await scrollToRow(list.current, key)
  }

  useBookmarks({ scroller, rows, onJump: jump })

  const toggle = useCallback(
    (key: string) => {
      const current = list.current
      if (current !== null && !(running && current.getState().isFollowingEnd)) {
        current.cancelScroll()
        current.anchorVisibleContent({ key })
      }
      setExpanded((keys) =>
        keys.includes(key)
          ? keys.filter((item) => item !== key)
          : [...keys, key]
      )
    },
    [running]
  )

  const attach = useCallback((instance: LegendListRef | null) => {
    list.current = instance
    const node = instance?.getScrollableNode()
    scroller.current = node instanceof HTMLDivElement ? node : null
  }, [])

  return (
    <>
      {finding && (
        <ThreadFindBar
          scroller={scroller}
          onClose={() => {
            setFinding(false)
            document.querySelector<HTMLElement>('[data-composer]')?.focus()
          }}
        />
      )}
      <TurnJumper
        rows={rows}
        list={list}
        scroller={scroller}
        onJump={(key) => void jump(key)}
      />
      <LegendList
        ref={attach}
        data-transcript
        data={rows}
        extraData={{
          found,
          running,
          activity,
          sending,
          expanded,
          cwd,
          older: olderRows.length,
        }}
        keyExtractor={listKey}
        getItemType={itemType}
        estimatedItemSize={90}
        recycleItems={false}
        initialScrollAtEnd
        maintainScrollAtEnd={
          running &&
          settled &&
          !window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? followEndSmooth
            : followEnd
        }
        maintainScrollAtEndThreshold={0}
        maintainVisibleContentPosition={
          finding ? false : { data: true, size: true }
        }
        alwaysRender={
          finding
            ? { indices: rows.map((_, index) => index) }
            : firstSelected !== -1 && lastSelected !== -1
              ? {
                  indices: Array.from(
                    {
                      length:
                        Math.max(firstSelected, lastSelected) -
                        Math.min(firstSelected, lastSelected) +
                        1,
                    },
                    (_, offset) =>
                      Math.min(firstSelected, lastSelected) + offset
                  ),
                }
              : undefined
        }
        className="topbar-scroll-fade relative min-h-0 flex-1 overflow-x-hidden overscroll-y-contain [overflow-anchor:none]"
        ListHeaderComponent={
          <Wrapper width="chat" className="pt-3">
            {!loaded && (
              <p className="text-muted-foreground py-6 text-center text-xs">
                Loading…
              </p>
            )}
            {before !== null && (
              <div className="flex justify-center pb-4">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost-muted"
                  disabled={loadingEarlier}
                  onClick={async () => {
                    setLoadingEarlier(true)
                    await loadEarlier()
                    setLoadingEarlier(false)
                  }}
                >
                  {loadingEarlier ? 'Loading…' : 'Load earlier conversation'}
                </Button>
              </div>
            )}
          </Wrapper>
        }
        ListFooterComponent={
          <>
            <div className="h-8" />
            <QuoteButton scroller={scroller} />
          </>
        }
        renderItem={(info) => {
          const row = info.item
          const index = info.index
          const previous = rows[index - 1]
          const older = index < olderRows.length
          return (
            <Wrapper width="chat" className="">
              <div
                data-row={row.key}
                data-kind={row.kind}
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
                  compacting={activity?.compacting === true}
                  sending={sending}
                  fork={!older}
                  expanded={expanded.includes(row.key)}
                  onToggle={toggle}
                  onOpenTask={props.onOpenTask}
                  rewind={!older}
                  resume={index === rows.length - 1}
                  cwd={cwd}
                />
              </div>
            </Wrapper>
          )
        }}
      />
    </>
  )
}

function listKey(row: Row) {
  return row.kind === 'assistant' ? row.slot : row.key
}

function itemType(row: Row) {
  if (row.kind !== 'assistant' && row.kind !== 'user') {
    return row.kind
  }
  const length =
    row.kind === 'assistant' ? row.text.length : row.item.text.length
  const bucket = Math.max(0, Math.floor(Math.log2(length / 1000)))
  return bucket < 2 ? `${row.kind}:${bucket}` : `${row.kind}:${listKey(row)}`
}

export const Transcript = memo(TranscriptView)

function RowContent(props: {
  row: Row
  agents: ReturnType<typeof threadTasks>['agents']
  tasks: ReturnType<typeof threadTasks>['tasks']
  cwd: string
  running: boolean
  compacting: boolean
  sending: boolean
  fork: boolean
  expanded: boolean
  onToggle: (key: string) => void
  onOpenTask: (id: string) => void
  rewind: boolean
  resume: boolean
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
          <Shimmer
            text={
              props.compacting
                ? 'Compacting conversation'
                : props.sending
                  ? 'Sending'
                  : 'Working'
            }
            active
          />
        </div>
      )
    case 'group':
      return (
        <ContextGroup
          entries={row.entries}
          cwd={props.cwd}
          live={row.live}
          open={props.expanded}
          onToggle={() => props.onToggle(row.key)}
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
    case 'received':
      return (
        <ReceivedMessage
          item={row.item}
          open={props.expanded}
          onToggle={() => props.onToggle(row.key)}
          onOpen={props.onOpenTask}
        />
      )
    case 'assistant':
      return (
        <>
          <div data-quotable data-message-text>
            <Markdown
              text={
                row.text === '' && !row.streaming
                  ? '(empty response)'
                  : row.text
              }
              streaming={row.streaming}
            />
          </div>
          {row.meta && (
            <div className="mt-1.5 flex items-center gap-2 text-xs tabular-nums opacity-0 transition-opacity duration-200 select-none group-hover/assistant:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
              <div className="flex items-center gap-0.5">
                <MessageCopyButton text={row.text} />
                <MessageBookmarkButton itemId={row.key} disabled={false} />
                {props.fork && <ForkButton uuid={row.message} />}
              </div>
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
          <span className="flex min-w-0 items-center gap-1 [overflow-wrap:anywhere]">
            {row.text}
            {props.resume && row.text === 'Interrupted' && <ResumeButton />}
          </span>
          <span className="bg-border/70 h-px flex-1" />
        </div>
      )
    case 'compaction':
      return (
        <CompactionRow
          summary={row.summary}
          time={row.time}
          expanded={props.expanded}
          onToggle={() => props.onToggle(row.key)}
        />
      )
    case 'plan':
      return (
        <div className="min-w-0" data-quotable>
          <PlanCard plan={row.plan} />
        </div>
      )
    case 'question':
      return <QuestionCard item={row.item} />
  }
}

export const RowView = memo(RowContent, (previous, next) =>
  next.row.kind === 'agent'
    ? isEqual(previous, next)
    : isEqual(
        omit(previous, ['agents', 'tasks']),
        omit(next, ['agents', 'tasks'])
      )
)
