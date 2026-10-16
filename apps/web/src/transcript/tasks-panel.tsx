import {
  ArrowLeft01Icon,
  CommandLineIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Message, Methods } from '@server/protocol'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { call } from '@/connection'
import { cn, errorMessage } from '@/lib/utils'
import { Markdown } from '@/markdown/markdown'
import { loadAgent, stopTask, useStore } from '@/store'
import { AgentSpinner, agentOf, SubagentIcon } from '@/transcript/agent-pill'
import { taskTitle, threadTasks } from '@/transcript/tasks'
import { isPrompt, isTool, turnRows } from '@/transcript/timeline'
import { text, type ToolUse } from '@/transcript/tool-details'
import { ToolRow } from '@/transcript/tool-row'
import { RowView } from '@/transcript/transcript'

type Found = ReturnType<typeof threadTasks>

export function TasksPanel(props: {
  cwd: string
  sessionId: string | null
  selected: string | null
  onSelect: (id: string | null) => void
  onOpenDiff: () => void
  onClose: () => void
}) {
  const messages = useStore((state) => state.messages)
  const earlier = useStore((state) => state.earlier)
  const activity = useStore((state) =>
    props.sessionId === null ? undefined : state.activity[props.sessionId]
  )
  const allMessages = [...earlier, ...messages]
  const found = threadTasks(allMessages, activity)
  const agent = found.agents.find((item) => item.tool.id === props.selected)
  const task = found.tasks.find((item) => item.tool.id === props.selected)
  const info = agent === undefined ? null : agentOf(agent.tool)

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 border-b pr-39 pl-3">
        <Button
          size="icon-sm"
          variant="ghost"
          title="Close"
          aria-label="Close"
          onClick={props.onClose}
        >
          <HugeiconsIcon icon={XIcon} className="size-3.5" />
        </Button>
        {agent === undefined && task === undefined && (
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            Tasks
          </span>
        )}
        {(agent !== undefined || task !== undefined) && (
          <div className="flex min-w-0 items-center gap-2 text-xs">
            <Button
              size="icon-sm"
              variant="ghost"
              title="Back to tasks"
              aria-label="Back to tasks"
              onClick={() => props.onSelect(null)}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
            </Button>
            {agent !== undefined && info !== null && (
              <>
                {agent.status === 'Running' ? (
                  <AgentSpinner className={info.tone} />
                ) : (
                  <SubagentIcon className={info.tone} />
                )}
                <span className="text-foreground shrink-0 font-medium">
                  {info.name}
                </span>
                {info.description !== '' && (
                  <span className="text-muted-foreground min-w-0 truncate">
                    {info.description}
                  </span>
                )}
                {agent.status === 'Running' &&
                  agent.agentId !== '' &&
                  props.sessionId !== null && (
                    <StopButton
                      sessionId={props.sessionId}
                      taskId={agent.agentId}
                    />
                  )}
              </>
            )}
            {task !== undefined && (
              <>
                <HugeiconsIcon
                  icon={CommandLineIcon}
                  className="text-muted-foreground size-4 shrink-0"
                />
                <span className="text-foreground min-w-0 truncate font-medium">
                  {taskTitle(task.tool)}
                </span>
                <span
                  className={cn(
                    'text-muted-foreground shrink-0',
                    task.status === 'Failed' && 'text-destructive'
                  )}
                >
                  {task.status}
                </span>
                {task.status === 'Running' &&
                  task.taskId !== '' &&
                  props.sessionId !== null && (
                    <StopButton
                      sessionId={props.sessionId}
                      taskId={task.taskId}
                    />
                  )}
              </>
            )}
          </div>
        )}
      </div>
      {agent === undefined && task === undefined && (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <h2 className="text-muted-foreground px-1 pb-1.5 text-xs font-medium">
            Agents
          </h2>
          {found.agents.length === 0 && (
            <p className="text-muted-foreground px-1 py-1 text-xs">
              No agents in this thread.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {[
              ...found.agents.filter((item) => item.status === 'Running'),
              ...found.agents.filter((item) => item.status !== 'Running'),
            ].map((item) => {
              const itemInfo = agentOf(item.tool)
              return (
                <button
                  key={item.tool.id}
                  type="button"
                  aria-label={`Open ${itemInfo.name} agent: ${itemInfo.description}`}
                  className="bg-secondary hover:bg-accent focus-visible:ring-ring/70 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] leading-5 tracking-[-0.04px] select-none focus-visible:ring-2 focus-visible:outline-none"
                  onClick={() => props.onSelect(item.tool.id)}
                >
                  {item.status === 'Running' ? (
                    <AgentSpinner className={itemInfo.tone} />
                  ) : (
                    <SubagentIcon className={itemInfo.tone} />
                  )}
                  <span className="text-foreground shrink-0 font-medium">
                    {itemInfo.name}
                  </span>
                  <span className="text-foreground min-w-0 flex-1 truncate">
                    {itemInfo.description}
                  </span>
                  <span
                    className={cn(
                      'text-muted-foreground shrink-0 text-xs',
                      item.status === 'Failed' && 'text-destructive'
                    )}
                  >
                    {item.status}
                  </span>
                </button>
              )
            })}
          </div>
          <h2 className="text-muted-foreground px-1 pt-5 pb-1.5 text-xs font-medium">
            Tasks
          </h2>
          {found.tasks.length === 0 && (
            <p className="text-muted-foreground px-1 py-1 text-xs">
              No background tasks in this thread.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            {[
              ...found.tasks.filter((item) => item.status === 'Running'),
              ...found.tasks.filter((item) => item.status !== 'Running'),
            ].map((item) => (
              <button
                key={item.tool.id}
                type="button"
                aria-label={`Open task: ${taskTitle(item.tool)}`}
                className="bg-secondary hover:bg-accent focus-visible:ring-ring/70 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] leading-5 tracking-[-0.04px] select-none focus-visible:ring-2 focus-visible:outline-none"
                onClick={() => props.onSelect(item.tool.id)}
              >
                <HugeiconsIcon
                  icon={CommandLineIcon}
                  className={cn(
                    'size-4 shrink-0',
                    item.status === 'Running'
                      ? 'text-foreground animate-pulse'
                      : 'text-muted-foreground'
                  )}
                />
                <span className="text-foreground min-w-0 flex-1 truncate">
                  {taskTitle(item.tool)}
                </span>
                <span
                  className={cn(
                    'text-muted-foreground shrink-0 text-xs',
                    item.status === 'Failed' && 'text-destructive'
                  )}
                >
                  {item.status}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {agent !== undefined && (
        <AgentView
          key={agent.tool.id}
          tool={agent.tool}
          agentId={agent.agentId}
          running={agent.status === 'Running'}
          messages={allMessages}
          found={found}
          cwd={props.cwd}
          onSelect={props.onSelect}
          onOpenDiff={props.onOpenDiff}
        />
      )}
      {task !== undefined && props.sessionId !== null && (
        <TaskView
          key={task.tool.id}
          sessionId={props.sessionId}
          command={text(task.tool.input.command)}
          path={task.path}
          events={task.events}
          running={task.status === 'Running'}
        />
      )}
    </div>
  )
}

function StopButton(props: { sessionId: string; taskId: string }) {
  return (
    <Button
      size="xs"
      variant="outline"
      className="shrink-0"
      onClick={() => stopTask(props.sessionId, props.taskId)}
    >
      Stop
    </Button>
  )
}

function TaskView(props: {
  sessionId: string
  command: string
  path: string | null
  events: string[]
  running: boolean
}) {
  const [output, setOutput] = useState<
    Methods['tasks.output']['result'] | undefined
  >(undefined)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const path = props.path
    if (path === null) return
    let current = true
    async function load(file: string) {
      try {
        const result = await call('tasks.output', {
          sessionId: props.sessionId,
          path: file,
        })
        if (!current) return
        setOutput(result)
        setError(null)
      } catch (caught) {
        if (current) setError(errorMessage(caught))
      }
    }
    void load(path)
    const timer = props.running
      ? window.setInterval(() => void load(path), 2000)
      : null
    return () => {
      current = false
      if (timer !== null) window.clearInterval(timer)
    }
  }, [props.sessionId, props.path, props.running])

  useLayoutEffect(() => {
    const element = scroller.current
    if (element !== null && pinned.current)
      element.scrollTop = element.scrollHeight
  }, [output, props.events])

  const shown =
    props.path === null
      ? props.events.join('\n')
      : output === undefined || output === null
        ? ''
        : output.text

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-3"
      onScroll={(event) => {
        const element = event.currentTarget
        pinned.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 40
      }}
    >
      {props.command !== '' && (
        <p className="text-muted-foreground pb-2 font-mono text-xs [overflow-wrap:anywhere] whitespace-pre-wrap">
          $ {props.command}
        </p>
      )}
      {error !== null && <p className="text-destructive text-xs">{error}</p>}
      {error === null && props.path !== null && output === undefined && (
        <p className="text-muted-foreground text-xs">Loading…</p>
      )}
      {error === null && props.path !== null && output === null && (
        <p className="text-muted-foreground text-xs">
          The output file no longer exists.
        </p>
      )}
      {output?.truncated === true && (
        <p className="text-muted-foreground pb-2 text-xs">
          Showing the end of the output.
        </p>
      )}
      {props.path === null && props.events.length === 0 && (
        <p className="text-muted-foreground text-xs">No events yet.</p>
      )}
      {output?.text === '' && (
        <p className="text-muted-foreground text-xs">
          {props.running ? 'No output yet.' : 'No output.'}
        </p>
      )}
      {shown !== '' && (
        <pre className="bg-secondary text-foreground rounded-lg p-3 font-mono text-xs leading-5 [overflow-wrap:anywhere] whitespace-pre-wrap select-text">
          {shown}
        </pre>
      )}
    </div>
  )
}

function AgentView(props: {
  tool: ToolUse
  agentId: string
  running: boolean
  messages: Message[]
  found: Found
  cwd: string
  onSelect: (id: string) => void
  onOpenDiff: () => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [expanded, setExpanded] = useState<string[]>([])

  useLayoutEffect(() => {
    const element = scroller.current
    if (element !== null && pinned.current)
      element.scrollTop = element.scrollHeight
  }, [props.messages, props.running])

  function toggle(key: string) {
    setExpanded(
      expanded.includes(key)
        ? expanded.filter((item) => item !== key)
        : [...expanded, key]
    )
  }

  const agentMessages = props.messages.filter(
    (message) => message.type !== 'notice' && message.parent === props.tool.id
  )
  const missing = agentMessages.length === 0

  useEffect(() => {
    if (missing && props.agentId !== '')
      void loadAgent(props.tool.id, props.agentId)
  }, [missing, props.tool.id, props.agentId])

  const prompt =
    agentMessages[0]?.type === 'user' && isPrompt(agentMessages[0].content)
      ? agentMessages[0]
      : null
  const rows = turnRows(
    {
      prompt: null,
      first: false,
      items: prompt === null ? agentMessages : agentMessages.slice(1),
    },
    props.cwd,
    props.running ? { partial: '' } : null
  )

  return (
    <div
      ref={scroller}
      className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pt-1 pb-8"
      onScroll={(event) => {
        const element = event.currentTarget
        pinned.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 40
      }}
    >
      {prompt !== null && (
        <ToolRow
          title="Prompt"
          pending={false}
          grouped
          open={expanded.includes('prompt')}
          onToggle={() => toggle('prompt')}
        >
          <Markdown
            text={prompt.content
              .flatMap((block) => (block.type === 'text' ? [block.text] : []))
              .join('\n')}
            className="text-muted-foreground text-[13px]"
          />
        </ToolRow>
      )}
      {rows.map((row, index) => {
        const previous = rows[index - 1]
        return (
          <div
            key={row.key}
            className={cn(
              previous === undefined
                ? 'pt-2'
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
              results={props.found.results}
              agents={props.found.agents}
              tasks={props.found.tasks}
              running={props.running}
              fork={false}
              expanded={expanded.includes(row.key)}
              onToggle={() => toggle(row.key)}
              onOpenTask={(tool) => props.onSelect(tool.id)}
              onRewind={null}
              onOpenDiff={props.onOpenDiff}
              cwd={props.cwd}
            />
          </div>
        )
      })}
    </div>
  )
}
