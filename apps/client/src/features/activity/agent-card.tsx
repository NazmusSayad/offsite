import { CommandLineIcon, StopIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { WorktreeIcon } from '@offsite/core/icons/git'
import type { SessionActivity } from '@offsite/core/sessions'
import { type ReactNode, useState } from 'react'
import { useProjectName } from '@/api/projects'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { fixedModes } from '@/features/composer/more-menu'
import { SessionStatus } from '@/features/sidebar/session-status'
import {
  AgentSpinner,
  agentOf,
  SubagentIcon,
} from '@/features/transcript/agent-pill'
import { type Stopping, StopTaskDialog } from '@/features/transcript/stop-task'
import { taskTitle, threadTasks } from '@/features/transcript/tasks'
import { summary } from '@/features/transcript/tool-details'
import { subtitleOf, toolTitle } from '@/features/transcript/tool-parts'
import { timeLeft } from '@/lib/format'
import { openSession } from '@/lib/sessions'
import { type MachineSession, projectOf, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { AgentRequest } from './agent-request'

export type Agent = { session: MachineSession; activity: SessionActivity }

export function AgentTile(props: { agent: Agent; now: number }) {
  const session = props.agent.session
  const activity = props.agent.activity
  const cwd = useStore(
    (state) => projectOf(state, session.machine, session.projectId)?.path ?? ''
  )
  const [stopping, setStopping] = useState<Stopping | null>(null)
  const stage = stageOf(activity)
  const tasks = runningTasks(activity) - activity.backgroundAgents
  const request = activity.requests.at(0)

  function open() {
    openSession({
      machine: session.machine,
      projectId: session.projectId,
      sessionId: session.id,
      pending: null,
    })
  }

  return (
    <div
      className={cn(
        'rounded-md border',
        stage === 0 && 'border-question/40 bg-foreground/3',
        (stage === 1 || stage === 2) && 'border-border bg-foreground/3',
        stage === 3 && 'border-transparent'
      )}
    >
      <HoverCard openDelay={300} closeDelay={100}>
        <HoverCardTrigger asChild>
          <button
            className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 px-2.5 text-left text-[13px]"
            onClick={open}
          >
            <span className="grid size-4 shrink-0 place-items-center">
              <SessionStatus
                session={session}
                activity={activity}
                done={false}
              />
            </span>
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                stage === 3 ? 'text-muted-foreground' : 'text-foreground'
              )}
            >
              {session.title}
            </span>
            <span className="text-muted-foreground flex shrink-0 items-center gap-2.5 text-xs tabular-nums">
              {activity.backgroundAgents > 0 && (
                <span className="flex items-center gap-1" title="Subagents">
                  <SubagentIcon className="size-3" />
                  {activity.backgroundAgents}
                </span>
              )}
              {tasks > 0 && (
                <span
                  className="flex items-center gap-1"
                  title="Background tasks"
                >
                  <HugeiconsIcon icon={CommandLineIcon} className="size-3.5" />
                  {tasks}
                </span>
              )}
              {activity.workingSince !== null && (
                <span>{timeLeft(props.now - activity.workingSince)}</span>
              )}
            </span>
          </button>
        </HoverCardTrigger>
        <HoverCardContent side="right" align="start" className="w-80 p-0">
          <AgentDetails
            agent={props.agent}
            cwd={cwd}
            now={props.now}
            onStop={setStopping}
          />
        </HoverCardContent>
      </HoverCard>
      {request !== undefined && (
        <AgentRequest
          machine={session.machine}
          sessionId={session.id}
          request={request}
          cwd={cwd}
          onOpen={open}
        />
      )}
      <StopTaskDialog
        machine={session.machine}
        sessionId={session.id}
        stopping={stopping}
        onClose={() => setStopping(null)}
      />
    </div>
  )
}

function AgentDetails(props: {
  agent: Agent
  cwd: string
  now: number
  onStop: (stopping: Stopping) => void
}) {
  const session = props.agent.session
  const activity = props.agent.activity
  const settings = activity.settings
  const projectName = useProjectName(session.machine, session.projectId)
  const worktree = useStore(
    (state) =>
      (projectOf(state, session.machine, session.projectId)?.parentId ??
        null) !== null
  )
  const found = threadTasks(activity.work, activity)
  const agents = found.agents.filter((item) => item.status === 'Running')
  const tasks = found.tasks.filter((item) => item.status === 'Running')
  const mode =
    settings.provider === 'opencode'
      ? undefined
      : fixedModes[settings.provider].find(
          (item) => item.value === settings.mode
        )
  const step = activity.step === null ? null : stepOf(activity.step, props.cwd)
  const todos = activity.todos ?? []
  const todo =
    todos.find((item) => item.status === 'running') ??
    todos.find((item) => item.status === 'pending')
  const completed = todos.filter((item) => item.status === 'completed').length

  return (
    <div className="flex flex-col gap-2 p-3 text-xs">
      <p className="text-muted-foreground truncate">
        {projectName}
        {session.branch !== null && (
          <>
            {worktree ? (
              <HugeiconsIcon
                icon={WorktreeIcon}
                className="mx-1 inline size-3 align-[-2px]"
              />
            ) : (
              ' | '
            )}
            {session.branch}
          </>
        )}
      </p>
      {step !== null && (
        <p className="flex min-w-0 items-baseline gap-1.5 text-[13px]">
          {step.label !== '' && (
            <span className="text-foreground shrink-0">{step.label}</span>
          )}
          <span className="text-muted-foreground line-clamp-3 min-w-0 wrap-anywhere">
            {step.detail}
          </span>
        </p>
      )}
      {todo !== undefined && (
        <p className="text-muted-foreground flex min-w-0 items-center gap-2">
          <span className="shrink-0 tabular-nums">
            {completed}/{todos.length}
          </span>
          <span className="truncate">{todo.text}</span>
        </p>
      )}
      {agents.length + tasks.length > 0 && (
        <ul className="flex flex-col">
          {agents.map((item) => (
            <WorkRow
              key={item.item.id}
              icon={<AgentSpinner className={agentOf(item.item).tone} />}
              title={item.item.description}
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
              onStop={props.onStop}
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
              time={item.item.time}
              now={props.now}
              stop={
                item.taskId === null
                  ? null
                  : { taskId: item.taskId, title: taskTitle(item.item) }
              }
              onStop={props.onStop}
            />
          ))}
        </ul>
      )}
      <p className="text-muted-foreground flex items-center gap-1.5 tabular-nums">
        {mode !== undefined && (
          <HugeiconsIcon icon={mode.icon} className="size-3.5 shrink-0" />
        )}
        <span className="truncate">
          {[
            settings.model ?? 'Default',
            ...(settings.effort === null ? [] : [settings.effort]),
            ...(activity.context === null || activity.context.window === null
              ? []
              : [
                  `${Math.round((activity.context.tokens / activity.context.window) * 100)}% context`,
                ]),
          ].join(' · ')}
        </span>
      </p>
    </div>
  )
}

function WorkRow(props: {
  icon: ReactNode
  title: string
  time: number | null
  now: number
  stop: Stopping | null
  onStop: (stopping: Stopping) => void
}) {
  const stop = props.stop
  return (
    <li className="flex h-6 min-w-0 items-center gap-2">
      <span className="grid size-4 shrink-0 place-items-center">
        {props.icon}
      </span>
      <span className="text-foreground/90 min-w-0 flex-1 truncate">
        {props.title}
      </span>
      {props.time !== null && (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {timeLeft(props.now - props.time)}
        </span>
      )}
      {stop !== null && (
        <button
          className="text-muted-foreground hover:text-foreground grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm"
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
