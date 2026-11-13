import { ArrowLeft01Icon, CommandLineIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Item } from '@offsite/core/items'
import type { RpcMethods } from '@offsite/core/protocol'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { Markdown } from '@/components/markdown/markdown'
import { Button } from '@/components/ui/button'
import {
  AgentSpinner,
  agentOf,
  SubagentIcon,
} from '@/features/transcript/agent-pill'
import {
  StopButton,
  StopIconButton,
  StopTaskDialog,
  type Stopping,
} from '@/features/transcript/stop-task'
import { taskTitle, threadTasks } from '@/features/transcript/tasks'
import { isTool, turnRows } from '@/features/transcript/timeline'
import { ToolRow } from '@/features/transcript/tool-row'
import { RowView } from '@/features/transcript/transcript'
import { PanelCloseButton } from '@/features/workspace/panel-close-button'
import { loadAgent } from '@/lib/sessions'
import { activityOf, useStore } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

type Found = ReturnType<typeof threadTasks>

export function TasksPanel(props: {
  machine: string
  cwd: string
  sessionId: string | null
  selected: string | null
  onSelect: (id: string | null) => void
  onClose: () => void
  mobile: boolean
}) {
  const items = useStore((state) => state.items)
  const earlier = useStore((state) => state.earlier)
  const activity = useStore((state) =>
    activityOf(state.machines, props.machine, props.sessionId)
  )
  const [stopping, setStopping] = useState<Stopping | null>(null)
  const allItems = [...earlier, ...items]
  const found = threadTasks(allItems, activity)
  const agent = found.agents.find((item) => item.item.id === props.selected)
  const task = found.tasks.find((item) => item.item.id === props.selected)
  const info = agent === undefined ? null : agentOf(agent.item)

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 border-b pr-3 pl-3">
        <PanelCloseButton
          mobile={props.mobile}
          onClick={() =>
            props.mobile && (agent !== undefined || task !== undefined)
              ? props.onSelect(null)
              : props.onClose()
          }
        />
        {agent === undefined && task === undefined && (
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            Tasks
          </span>
        )}
        {(agent !== undefined || task !== undefined) && (
          <div className="flex min-w-0 items-center gap-2 text-xs">
            {!props.mobile && (
              <Button
                size="icon-sm"
                variant="ghost"
                title="Back to tasks"
                aria-label="Back to tasks"
                onClick={() => props.onSelect(null)}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
              </Button>
            )}
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
                  agent.agentId !== null &&
                  props.sessionId !== null && (
                    <StopButton
                      machine={props.machine}
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
                  {taskTitle(task.item)}
                </span>
                <span
                  className={cn(
                    'text-muted-foreground shrink-0',
                    task.status === 'Failed' && 'text-destructive',
                    task.status === 'Running' && 'text-shimmer'
                  )}
                >
                  {task.status}
                </span>
                {task.status === 'Running' &&
                  task.taskId !== null &&
                  props.sessionId !== null && (
                    <StopButton
                      machine={props.machine}
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
              const itemInfo = agentOf(item.item)
              const agentId = item.agentId
              return (
                <div
                  key={item.item.id}
                  className="bg-secondary hover:bg-accent flex items-center rounded-lg"
                >
                  <button
                    type="button"
                    aria-label={`Open ${itemInfo.name} agent: ${itemInfo.description}`}
                    className="focus-visible:ring-ring/70 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] leading-5 tracking-[-0.04px] select-none focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() => props.onSelect(item.item.id)}
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
                        item.status === 'Failed' && 'text-destructive',
                        item.status === 'Running' && 'text-shimmer'
                      )}
                    >
                      {item.status}
                    </span>
                  </button>
                  {item.status === 'Running' &&
                    agentId !== null &&
                    props.sessionId !== null && (
                      <StopIconButton
                        label={`Stop ${itemInfo.name} agent`}
                        onClick={() =>
                          setStopping({
                            taskId: agentId,
                            title: `${itemInfo.name} agent`,
                          })
                        }
                      />
                    )}
                </div>
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
            ].map((item) => {
              const taskId = item.taskId
              return (
                <div
                  key={item.item.id}
                  className="bg-secondary hover:bg-accent flex items-center rounded-lg"
                >
                  <button
                    type="button"
                    aria-label={`Open task: ${taskTitle(item.item)}`}
                    className="focus-visible:ring-ring/70 flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] leading-5 tracking-[-0.04px] select-none focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() => props.onSelect(item.item.id)}
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
                      {taskTitle(item.item)}
                    </span>
                    <span
                      className={cn(
                        'text-muted-foreground shrink-0 text-xs',
                        item.status === 'Failed' && 'text-destructive',
                        item.status === 'Running' && 'text-shimmer'
                      )}
                    >
                      {item.status}
                    </span>
                  </button>
                  {item.status === 'Running' &&
                    taskId !== null &&
                    props.sessionId !== null && (
                      <StopIconButton
                        label={`Stop task: ${taskTitle(item.item)}`}
                        onClick={() =>
                          setStopping({ taskId, title: taskTitle(item.item) })
                        }
                      />
                    )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {agent !== undefined && (
        <AgentView
          key={agent.item.id}
          item={agent.item}
          agentId={agent.agentId}
          running={agent.status === 'Running'}
          items={allItems}
          found={found}
          cwd={props.cwd}
          onSelect={props.onSelect}
        />
      )}
      {task !== undefined && props.sessionId !== null && (
        <TaskView
          key={task.item.id}
          machine={props.machine}
          sessionId={props.sessionId}
          command={task.item.command}
          path={task.path}
          events={task.events}
          running={task.status === 'Running'}
        />
      )}
      <StopTaskDialog
        machine={props.machine}
        sessionId={props.sessionId}
        stopping={stopping}
        onClose={() => setStopping(null)}
      />
    </div>
  )
}

function TaskView(props: {
  machine: string
  sessionId: string
  command: string
  path: string | null
  events: string[]
  running: boolean
}) {
  const [output, setOutput] = useState<
    RpcMethods['tasks.output']['result'] | undefined
  >(undefined)
  const [error, setError] = useState<string | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const path = props.path
    if (path === null) {
      return
    }
    let current = true
    async function load(file: string) {
      try {
        const result = await call(props.machine, 'tasks.output', {
          sessionId: props.sessionId,
          path: file,
        })
        if (!current) {
          return
        }
        setOutput(result)
        setError(null)
      } catch (caught) {
        if (current) {
          setError(errorMessage(caught))
        }
      }
    }
    void load(path)
    const timer = props.running
      ? window.setInterval(() => void load(path), 2000)
      : null
    return () => {
      current = false
      if (timer !== null) {
        window.clearInterval(timer)
      }
    }
  }, [props.machine, props.sessionId, props.path, props.running])

  useLayoutEffect(() => {
    const element = scroller.current
    if (element !== null && pinned.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [output, props.events])

  const shown =
    props.path === null ? props.events.join('\n') : (output?.text ?? '')

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
  item: Extract<Item, { kind: 'subagent' }>
  agentId: string | null
  running: boolean
  items: Item[]
  found: Found
  cwd: string
  onSelect: (id: string) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const [expanded, setExpanded] = useState<string[]>([])

  useLayoutEffect(() => {
    const element = scroller.current
    if (element !== null && pinned.current) {
      element.scrollTop = element.scrollHeight
    }
  }, [props.items, props.running])

  function toggle(key: string) {
    setExpanded(
      expanded.includes(key)
        ? expanded.filter((item) => item !== key)
        : [...expanded, key]
    )
  }

  const agentItems = props.items.filter((item) => item.parent === props.item.id)
  const missing = agentItems.length === 0

  useEffect(() => {
    if (missing && props.agentId !== null) {
      void loadAgent(props.item.id, props.agentId)
    }
  }, [missing, props.item.id, props.agentId])

  const first = agentItems.at(0)
  const prompt = first?.kind === 'user' ? first : null
  const rows = turnRows(
    {
      prompt: null,
      first: false,
      items: prompt === null ? agentItems : agentItems.slice(1),
    },
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
            text={prompt.text}
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
              agents={props.found.agents}
              tasks={props.found.tasks}
              running={props.running}
              compacting={false}
              sending={false}
              fork={false}
              expanded={expanded.includes(row.key)}
              onToggle={toggle}
              onOpenTask={props.onSelect}
              rewind={false}
              cwd={props.cwd}
            />
          </div>
        )
      })}
    </div>
  )
}
