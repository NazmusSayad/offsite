import {
  AlertDiamondIcon,
  GitForkIcon,
  Minimize02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { clock, fullTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Markdown } from '@/markdown/markdown'
import { forkFrom, loadEarlier, selectedRunning, useStore } from '@/store'
import { AgentHeader, AgentPill } from '@/transcript/agent-pill'
import { ChangedFilesCard } from '@/transcript/changed-files'
import { PlanCard } from '@/transcript/plan-card'
import { RewindDialog, type RewindTarget } from '@/transcript/rewind-dialog'
import {
  isPrompt,
  isTool,
  mainRows,
  type Row,
  turnRows,
} from '@/transcript/timeline'
import type { ToolResult, ToolUse } from '@/transcript/tool-details'
import { ContextGroup } from '@/transcript/tool-group'
import { Shimmer, ToolRow } from '@/transcript/tool-row'
import { MessageCopyButton, UserMessage } from '@/transcript/user-message'

export function Transcript(props: { onOpenDiff: () => void }) {
  const selection = useStore((state) => state.selection)
  const loaded = useStore((state) => state.loaded)
  const messages = useStore((state) => state.messages)
  const earlier = useStore((state) => state.earlier)
  const before = useStore((state) => state.before)
  const partial = useStore((state) => state.partial)
  const requests = useStore((state) => state.requests)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const fromBottom = useRef<number | null>(null)
  const [loadingEarlier, setLoadingEarlier] = useState(false)
  const [rewind, setRewind] = useState<RewindTarget | null>(null)
  const [expanded, setExpanded] = useState<string[]>([])
  const [opened, setOpened] = useState<{
    sessionId: string
    toolId: string
  } | null>(null)
  const sessionId = selection?.sessionId ?? null
  const cwd = selection?.cwd ?? ''
  const running = useStore(selectedRunning)

  const results = new Map<string, ToolResult>()
  const tools = new Map<string, ToolUse>()
  const allMessages = [...earlier, ...messages]
  for (const message of allMessages)
    if (message.type !== 'notice')
      for (const block of message.content) {
        if (block.type === 'tool_result') results.set(block.toolUseId, block)
        if (block.type === 'tool_use') tools.set(block.id, block)
      }

  const agent =
    opened !== null && opened.sessionId === sessionId
      ? (tools.get(opened.toolId) ?? null)
      : null

  useLayoutEffect(() => {
    const element = scroller.current
    if (element !== null && pinned.current)
      element.scrollTop = element.scrollHeight
  }, [messages, partial, requests, running, agent?.id])

  useLayoutEffect(() => {
    const element = scroller.current
    if (element !== null && fromBottom.current !== null && earlier.length > 0)
      element.scrollTop = element.scrollHeight - fromBottom.current
    fromBottom.current = null
  }, [earlier])

  function toggle(key: string) {
    setExpanded(
      expanded.includes(key)
        ? expanded.filter((item) => item !== key)
        : [...expanded, key]
    )
  }

  function openAgent(tool: ToolUse) {
    if (sessionId === null) return
    pinned.current = true
    setOpened({ sessionId, toolId: tool.id })
  }

  const agentMessages =
    agent === null
      ? []
      : allMessages.filter(
          (message) => message.type !== 'notice' && message.parent === agent.id
        )
  const agentPrompt =
    agentMessages[0]?.type === 'user' && isPrompt(agentMessages[0].content)
      ? agentMessages[0]
      : null
  const olderRows = agent === null ? mainRows(earlier, cwd, false, '') : []
  const rows =
    agent === null
      ? [...olderRows, ...mainRows(messages, cwd, running, partial)]
      : turnRows(
          {
            prompt: null,
            first: false,
            items:
              agentPrompt === null ? agentMessages : agentMessages.slice(1),
          },
          cwd,
          running && !results.has(agent.id) ? { partial: '' } : null
        )

  return (
    <div
      ref={scroller}
      className="topbar-scroll-fade min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-8 sm:px-12"
      onScroll={(event) => {
        const element = event.currentTarget
        pinned.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 40
      }}
    >
      <div className="mx-auto w-full max-w-(--chat-content-max-width) pt-3">
        {!loaded && (
          <p className="text-muted-foreground py-6 text-center text-xs">
            Loading…
          </p>
        )}
        {agent !== null && (
          <>
            <AgentHeader
              tool={agent}
              running={running && !results.has(agent.id)}
              onBack={() => setOpened(null)}
            />
            {agentPrompt !== null && (
              <ToolRow
                title="Prompt"
                pending={false}
                grouped
                open={expanded.includes(`prompt:${agent.id}`)}
                onToggle={() => toggle(`prompt:${agent.id}`)}
              >
                <Markdown
                  text={agentPrompt.content
                    .flatMap((block) =>
                      block.type === 'text' ? [block.text] : []
                    )
                    .join('\n')}
                  className="text-muted-foreground text-[13px]"
                />
              </ToolRow>
            )}
          </>
        )}
        {agent === null && before !== null && (
          <div className="flex justify-center pb-4">
            <Button
              type="button"
              size="xs"
              variant="ghost-muted"
              disabled={loadingEarlier}
              onClick={async () => {
                const element = scroller.current
                if (element !== null)
                  fromBottom.current = element.scrollHeight - element.scrollTop
                setLoadingEarlier(true)
                await loadEarlier()
                setLoadingEarlier(false)
              }}
            >
              {loadingEarlier ? 'Loading…' : 'Load earlier conversation'}
            </Button>
          </div>
        )}
        {rows.map((row, index) => {
          const previous = rows[index - 1]
          const older = index < olderRows.length
          return (
            <div
              key={row.key}
              className={cn(
                previous === undefined
                  ? agent === null
                    ? undefined
                    : 'pt-2'
                  : row.kind === 'user'
                    ? 'pt-6'
                    : row.kind === 'working'
                      ? undefined
                      : isTool(row) && isTool(previous)
                        ? 'pt-2'
                        : 'pt-4',
                row.kind === 'assistant' && 'group/assistant'
              )}
            >
              <RowView
                row={row}
                results={results}
                running={running}
                fork={agent === null && !older}
                rewind={!older}
                expanded={expanded.includes(row.key)}
                onToggle={() => toggle(row.key)}
                onOpenAgent={openAgent}
                onRewind={setRewind}
                onOpenDiff={props.onOpenDiff}
                cwd={cwd}
              />
            </div>
          )
        })}
      </div>
      <RewindDialog target={rewind} onClose={() => setRewind(null)} />
    </div>
  )
}

function RowView(props: {
  row: Row
  results: Map<string, ToolResult>
  cwd: string
  running: boolean
  fork: boolean
  rewind: boolean
  expanded: boolean
  onToggle: () => void
  onOpenAgent: (tool: ToolUse) => void
  onRewind: (target: RewindTarget) => void
  onOpenDiff: () => void
}) {
  const row = props.row
  switch (row.kind) {
    case 'user':
      return (
        <UserMessage
          uuid={row.message.uuid}
          time={row.message.time}
          blocks={row.message.content}
          first={row.first}
          running={props.running}
          rewind={props.rewind}
          onRewind={props.onRewind}
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
          results={props.results}
          cwd={props.cwd}
          live={row.live}
          open={props.expanded}
          onToggle={props.onToggle}
        />
      )
    case 'agent':
      return (
        <AgentPill
          tool={row.tool}
          running={row.live && !props.results.has(row.tool.id)}
          onOpen={() => props.onOpenAgent(row.tool)}
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
              {props.fork && <ForkButton uuid={row.uuid} />}
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
