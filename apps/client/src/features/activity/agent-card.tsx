import { CommandLineIcon, StopIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SessionActivity } from '@offsite/core/sessions'
import { type ReactNode, useState } from 'react'
import { useProjectName } from '@/api/projects'
import { fixedModes } from '@/features/composer/more-menu'
import { SessionStatus } from '@/features/sidebar/session-status'
import { AgentSpinner, agentOf } from '@/features/transcript/agent-pill'
import { type Stopping, StopTaskDialog } from '@/features/transcript/stop-task'
import { taskTitle, threadTasks } from '@/features/transcript/tasks'
import { summary } from '@/features/transcript/tool-details'
import { subtitleOf, toolTitle } from '@/features/transcript/tool-parts'
import { timeAgo, timeLeft } from '@/lib/format'
import { openSession } from '@/lib/sessions'
import {
  type Machine,
  type MachineSession,
  projectOf,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'
import { AgentRequest } from './agent-request'

export type Agent = { session: MachineSession; activity: SessionActivity }

export function AgentCard(props: {
  machine: Machine
  agent: Agent
  now: number
}) {
  const session = props.agent.session
  const activity = props.agent.activity
  const settings = activity.settings
  const cwd = useStore(
    (state) => projectOf(state, session.machine, session.projectId)?.path ?? ''
  )
  const projectName = useProjectName(session.machine, session.projectId)
  const [stopping, setStopping] = useState<Stopping | null>(null)
  const found = threadTasks(activity.work, activity)
  const agents = found.agents.filter((item) => item.status === 'Running')
  const tasks = found.tasks.filter((item) => item.status === 'Running')
  const queued = props.machine.outbox.filter(
    (item) => item.sessionId === session.id && item.status === 'queued'
  ).length
  const mode =
    settings.provider === 'opencode'
      ? undefined
      : fixedModes[settings.provider].find(
          (item) => item.value === settings.mode
        )
  const step = activity.step === null ? null : stepOf(activity.step, cwd)
  const todos = activity.todos ?? []
  const todo =
    todos.find((item) => item.status === 'running') ??
    todos.find((item) => item.status === 'pending')
  const completed = todos.filter((item) => item.status === 'completed').length

  function open() {
    openSession({
      machine: session.machine,
      projectId: session.projectId,
      sessionId: session.id,
    })
  }

  return (
    <article className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="flex flex-col gap-1.5 px-3 pt-2.5 pb-2">
        <button
          className="group flex h-5 w-full min-w-0 cursor-pointer items-center gap-2 text-left"
          onClick={open}
        >
          <span className="grid size-4 shrink-0 place-items-center">
            <SessionStatus session={session} activity={activity} done={false} />
          </span>
          <span className="text-foreground min-w-0 flex-1 truncate font-medium group-hover:underline">
            {session.title}
          </span>
          {queued > 0 && (
            <span className="text-muted-foreground shrink-0 text-xs">
              {queued} queued
            </span>
          )}
          {activity.workingSince !== null && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {timeLeft(props.now - activity.workingSince)}
            </span>
          )}
        </button>
        {step !== null && (
          <p className="flex min-w-0 items-baseline gap-1.5 pl-6 text-[13px] leading-snug">
            {step.label !== '' && (
              <span
                className={cn(
                  'text-foreground/90 shrink-0',
                  activity.running && 'text-shimmer'
                )}
              >
                {step.label}
              </span>
            )}
            <span
              className={cn(
                'text-muted-foreground min-w-0',
                step.label === '' ? 'line-clamp-2' : 'truncate'
              )}
            >
              {step.detail}
            </span>
          </p>
        )}
        {todo !== undefined && (
          <p className="text-muted-foreground flex min-w-0 items-center gap-2 pl-6 text-xs">
            <span className="bg-foreground/10 relative h-1 w-8 shrink-0 overflow-hidden rounded-full">
              <span
                className="bg-foreground/50 absolute inset-y-0 left-0"
                style={{ width: `${(completed / todos.length) * 100}%` }}
              />
            </span>
            <span className="shrink-0 tabular-nums">
              {completed}/{todos.length}
            </span>
            <span className="truncate">{todo.text}</span>
          </p>
        )}
        {agents.length + tasks.length > 0 && (
          <ul className="flex flex-col pl-6">
            {agents.map((item) => (
              <WorkRow
                key={item.item.id}
                icon={<AgentSpinner className={agentOf(item.item).tone} />}
                title={agentOf(item.item).name}
                detail={item.item.description}
                time={item.item.time}
                now={props.now}
                stop={
                  item.agentId === null
                    ? null
                    : {
                        taskId: item.agentId,
                        title: `${agentOf(item.item).name} agent`,
                      }
                }
                onStop={setStopping}
              />
            ))}
            {tasks.map((item) => (
              <WorkRow
                key={item.item.id}
                icon={
                  <HugeiconsIcon
                    icon={CommandLineIcon}
                    className="text-muted-foreground size-3.5"
                  />
                }
                title={taskTitle(item.item)}
                detail=""
                time={item.item.time}
                now={props.now}
                stop={
                  item.taskId === null
                    ? null
                    : { taskId: item.taskId, title: taskTitle(item.item) }
                }
                onStop={setStopping}
              />
            ))}
          </ul>
        )}
        <p className="text-muted-foreground/80 flex min-w-0 items-center gap-1.5 pl-6 text-xs">
          <span className="min-w-0 truncate">
            {projectName}
            {session.branch !== null && ` · ${session.branch}`}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 tabular-nums">
            {mode !== undefined && (
              <span title={mode.label} className="flex">
                <HugeiconsIcon icon={mode.icon} className="size-3.5" />
              </span>
            )}
            <span>
              {[
                settings.model ?? 'Default',
                ...(settings.effort === null ? [] : [settings.effort]),
                ...(activity.context === null ||
                activity.context.window === null
                  ? []
                  : [
                      `${Math.round((activity.context.tokens / activity.context.window) * 100)}%`,
                    ]),
              ].join(' · ')}
            </span>
          </span>
        </p>
      </div>
      {activity.requests.map((request) => (
        <AgentRequest
          key={request.id}
          machine={session.machine}
          sessionId={session.id}
          request={request}
          cwd={cwd}
          onOpen={open}
        />
      ))}
      <StopTaskDialog
        machine={session.machine}
        sessionId={session.id}
        stopping={stopping}
        onClose={() => setStopping(null)}
      />
    </article>
  )
}

export function IdleAgent(props: { agent: Agent }) {
  const session = props.agent.session
  return (
    <button
      className="hover:bg-accent/50 flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 text-left text-[13px]"
      onClick={() =>
        openSession({
          machine: session.machine,
          projectId: session.projectId,
          sessionId: session.id,
        })
      }
    >
      <span className="text-muted-foreground min-w-0 flex-1 truncate">
        {session.title}
      </span>
      <span className="text-muted-foreground/70 shrink-0 text-xs tabular-nums">
        {timeAgo(session.updatedAt)}
      </span>
    </button>
  )
}

function WorkRow(props: {
  icon: ReactNode
  title: string
  detail: string
  time: number | null
  now: number
  stop: Stopping | null
  onStop: (stopping: Stopping) => void
}) {
  const stop = props.stop
  return (
    <li className="group/work flex h-6 min-w-0 items-center gap-2 text-xs">
      <span className="grid size-4 shrink-0 place-items-center">
        {props.icon}
      </span>
      <span className="text-foreground/90 min-w-0 shrink truncate">
        {props.title}
      </span>
      {props.detail !== '' && (
        <span className="text-muted-foreground min-w-0 flex-1 truncate">
          {props.detail}
        </span>
      )}
      {props.time !== null && (
        <span className="text-muted-foreground ml-auto shrink-0 tabular-nums group-hover/work:hidden pointer-coarse:hidden">
          {timeLeft(props.now - props.time)}
        </span>
      )}
      {stop !== null && (
        <button
          className="text-muted-foreground hover:text-foreground ml-auto hidden size-5 shrink-0 cursor-pointer place-items-center rounded-sm group-hover/work:grid pointer-coarse:grid"
          title={`Stop ${stop.title}`}
          aria-label={`Stop ${stop.title}`}
          onClick={() => props.onStop(stop)}
        >
          <HugeiconsIcon icon={StopIcon} className="size-3.5" />
        </button>
      )}
    </li>
  )
}

function stepOf(item: NonNullable<SessionActivity['step']>, cwd: string) {
  switch (item.kind) {
    case 'command':
    case 'file_change':
    case 'web_search':
    case 'skill':
      return { label: toolTitle(item), detail: summary(item, cwd) }
    case 'tool':
      return { label: toolTitle(item), detail: subtitleOf(item, cwd) }
    case 'assistant':
      return { label: '', detail: item.text.trim().split('\n').at(-1) ?? '' }
    case 'reasoning':
      return { label: 'Thinking', detail: '' }
    case 'subagent':
      return { label: agentOf(item).name, detail: item.description }
    case 'agent_message':
      return { label: 'Message', detail: item.summary }
    case 'received_message':
      return { label: item.sender, detail: item.text }
    case 'question':
      return { label: 'Asked', detail: item.questions[0]?.question ?? '' }
    case 'plan':
      return { label: 'Plan', detail: item.plan.split('\n')[0] }
    case 'compaction':
      return { label: 'Compacted', detail: '' }
    case 'notice':
      return { label: 'Notice', detail: item.text }
    case 'error':
      return { label: 'Error', detail: item.text }
    case 'user':
      return { label: 'You', detail: item.text }
    case 'todo_list':
      return { label: 'Updated todos', detail: '' }
  }
}

export function runningTasks(activity: SessionActivity) {
  return Object.values(activity.tasks).filter((status) => status === 'running')
    .length
}

export function stageOf(activity: SessionActivity) {
  if (activity.waiting) {
    return 0
  }
  if (activity.running) {
    return 1
  }
  if (activity.holdsCompletion || runningTasks(activity) > 0) {
    return 2
  }
  return 3
}
