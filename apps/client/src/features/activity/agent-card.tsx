import {
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  CircleDotDashedIcon,
  CircleIcon,
  CommandLineIcon,
  StopIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { WorktreeIcon } from '@offsite/core/icons/git'
import type { Item } from '@offsite/core/items'
import type { SessionActivity } from '@offsite/core/sessions'
import { type ReactNode, useState } from 'react'
import { useProjectName } from '@/api/projects'
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

export type Agent = {
  session: MachineSession
  activity: SessionActivity | null
  done: boolean
}

export function AgentTile(props: { agent: Agent; now: number }) {
  const session = props.agent.session
  const activity = props.agent.activity
  const cwd = useStore(
    (state) => projectOf(state, session.machine, session.projectId)?.path ?? ''
  )
  const [stopping, setStopping] = useState<Stopping | null>(null)
  const [expanded, setExpanded] = useState(false)
  const stage = stageOf(props.agent)
  const request = activity?.requests.at(0)

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
        (stage === 3 || stage === 4) && 'border-transparent'
      )}
    >
      <div className="flex h-8 min-w-0 items-center">
        <button
          className={cn(
            'flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2 pl-2.5 text-left text-[13px]',
            activity === null && 'pr-2.5'
          )}
          onClick={open}
        >
          <span className="grid size-4 shrink-0 place-items-center">
            <SessionStatus
              session={session}
              activity={activity ?? undefined}
              done={props.agent.done}
            />
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              stage === 4 ? 'text-muted-foreground' : 'text-foreground'
            )}
          >
            {session.title}
          </span>
          {activity !== null && activity.workingSince !== null && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {timeLeft(props.now - activity.workingSince)}
            </span>
          )}
        </button>
        {activity !== null && (
          <button
            className="text-muted-foreground hover:text-foreground grid h-full w-8 shrink-0 cursor-pointer place-items-center"
            title={expanded ? 'Hide details' : 'Show details'}
            aria-label={expanded ? 'Hide details' : 'Show details'}
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn('size-3.5', expanded && 'rotate-180')}
            />
          </button>
        )}
      </div>
      {activity !== null && (stage !== 4 || expanded) && (
        <AgentDetails
          session={session}
          activity={activity}
          cwd={cwd}
          now={props.now}
          expanded={expanded}
          onStop={setStopping}
        />
      )}
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
  session: MachineSession
  activity: SessionActivity
  cwd: string
  now: number
  expanded: boolean
  onStop: (stopping: Stopping) => void
}) {
  const session = props.session
  const activity = props.activity
  const settings = activity.settings
  const projectName = useProjectName(session.machine, session.projectId)
  const worktree = useStore(
    (state) =>
      (projectOf(state, session.machine, session.projectId)?.parentId ??
        null) !== null
  )
  const found = threadTasks(activity.work, activity)
  const work = [
    ...found.agents.map((item) => ({
      id: item.item.id,
      status: item.status,
      icon:
        item.status === 'Running' ? (
          <AgentSpinner className={agentOf(item.item).tone} />
        ) : (
          <SubagentIcon className={cn('size-3.5', agentOf(item.item).tone)} />
        ),
      title: item.item.description,
      model: subagentModel(item.item, activity),
      time: item.item.time,
      stop:
        item.agentId === null
          ? null
          : { taskId: item.agentId, title: `${agentOf(item.item).name} agent` },
    })),
    ...found.tasks.map((item) => ({
      id: item.item.id,
      status: item.status,
      icon: (
        <HugeiconsIcon
          icon={CommandLineIcon}
          className={cn(
            'size-3.5',
            item.status === 'Running' ? 'text-info' : 'text-muted-foreground'
          )}
        />
      ),
      title: taskTitle(item.item),
      model: null,
      time: item.item.time,
      stop:
        item.taskId === null
          ? null
          : { taskId: item.taskId, title: taskTitle(item.item) },
    })),
  ]
  const shown = [
    ...work.filter((item) => item.status === 'Running'),
    ...(props.expanded ? work.filter((item) => item.status !== 'Running') : []),
  ]
  const mode =
    settings.provider === 'opencode'
      ? undefined
      : fixedModes[settings.provider].find(
          (item) => item.value === settings.mode
        )
  const step =
    activity.step === null ||
    shown.some((item) => item.id === activity.step?.id)
      ? null
      : stepOf(activity.step, props.cwd)
  const todos = activity.todos ?? []
  const todo =
    todos.find((item) => item.status === 'running') ??
    todos.find((item) => item.status === 'pending')
  const completed = todos.filter((item) => item.status === 'completed').length

  return (
    <div className="flex flex-col gap-1.5 pr-2.5 pb-2 pl-8 text-xs">
      {step !== null && (
        <p
          className={cn(
            'text-muted-foreground min-w-0',
            props.expanded ? 'line-clamp-3' : 'truncate'
          )}
        >
          {step.label !== '' && (
            <span className="text-foreground/80">{step.label} </span>
          )}
          {step.detail}
        </p>
      )}
      {!props.expanded && todo !== undefined && (
        <p className="text-muted-foreground flex min-w-0 items-center gap-2">
          <span className="text-foreground/80 shrink-0 tabular-nums">
            {completed}/{todos.length}
          </span>
          <span className="truncate">{todo.text}</span>
        </p>
      )}
      {props.expanded && todos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {todos.map((item, index) => (
            <li key={index} className="flex min-w-0 items-start gap-2">
              <span className="grid h-4 w-3.5 shrink-0 place-items-center">
                {item.status === 'completed' && (
                  <HugeiconsIcon
                    icon={CheckmarkCircle02Icon}
                    className="text-success size-3.5"
                  />
                )}
                {item.status === 'running' && (
                  <HugeiconsIcon
                    icon={CircleDotDashedIcon}
                    className="text-info size-3.5"
                  />
                )}
                {item.status === 'pending' && (
                  <HugeiconsIcon
                    icon={CircleIcon}
                    className="text-muted-foreground size-3.5"
                  />
                )}
              </span>
              <span
                className={cn(
                  'min-w-0 leading-4',
                  item.status === 'completed' && 'text-muted-foreground',
                  item.status === 'running' && 'text-foreground',
                  item.status === 'pending' && 'text-foreground/80'
                )}
              >
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 0 && (
        <ul className="flex flex-col">
          {shown.map((item) => (
            <WorkRow
              key={item.id}
              icon={item.icon}
              title={item.title}
              model={item.model}
              status={item.status}
              time={item.time}
              now={props.now}
              stop={item.status === 'Running' ? item.stop : null}
              onStop={props.onStop}
            />
          ))}
        </ul>
      )}
      {props.expanded && (
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
      )}
      <p className="text-muted-foreground flex min-w-0 items-center gap-1.5">
        {mode !== undefined && (
          <HugeiconsIcon icon={mode.icon} className="size-3.5 shrink-0" />
        )}
        <ModelBadge
          label={modelLabel(settings.model, settings.effort, activity)}
          context={
            activity.context === null || activity.context.window === null
              ? null
              : Math.round(
                  (activity.context.tokens / activity.context.window) * 100
                )
          }
        />
      </p>
    </div>
  )
}

function WorkRow(props: {
  icon: ReactNode
  title: string
  model: string | null
  status: string
  time: number | null
  now: number
  stop: Stopping | null
  onStop: (stopping: Stopping) => void
}) {
  const stop = props.stop
  return (
    <li className="flex min-w-0 flex-col gap-0.5 py-0.5">
      <div className="flex h-5 min-w-0 items-center gap-2">
        <span className="grid size-4 shrink-0 place-items-center">
          {props.icon}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate',
            props.status === 'Running'
              ? 'text-foreground/90'
              : 'text-muted-foreground'
          )}
        >
          {props.title}
        </span>
        {props.status !== 'Running' && (
          <span
            className={cn(
              'shrink-0',
              props.status === 'Failed'
                ? 'text-destructive'
                : 'text-muted-foreground'
            )}
          >
            {props.status}
          </span>
        )}
        {props.status === 'Running' && props.time !== null && (
          <span className="text-muted-foreground shrink-0 tabular-nums">
            {timeLeft(props.now - props.time)}
          </span>
        )}
        {stop !== null && (
          <button
            className="text-muted-foreground hover:text-foreground -mr-1 grid size-5 shrink-0 cursor-pointer place-items-center rounded-sm"
            title={`Stop ${stop.title}`}
            aria-label={`Stop ${stop.title}`}
            onClick={() => props.onStop(stop)}
          >
            <HugeiconsIcon icon={StopIcon} className="size-3.5" />
          </button>
        )}
      </div>
      {props.model !== null && (
        <span className="flex pl-6">
          <ModelBadge label={props.model} context={null} />
        </span>
      )}
    </li>
  )
}

function ModelBadge(props: { label: string; context: number | null }) {
  return (
    <span
      className="bg-foreground/5 text-muted-foreground relative flex h-5 max-w-full min-w-0 shrink-0 items-center overflow-hidden rounded-[6px] px-1.25 text-[11px] font-medium"
      title={
        props.context === null
          ? props.label
          : `${props.label} · ${props.context}% context`
      }
    >
      {props.context !== null && (
        <span
          className="bg-foreground/8 absolute inset-y-0 left-0"
          style={{ width: `${props.context}%` }}
        />
      )}
      <span className="relative truncate">{props.label}</span>
    </span>
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

function subagentModel(
  item: Extract<Item, { kind: 'subagent' }>,
  activity: SessionActivity
) {
  const defined = activity.agentModels[item.agent]
  return modelLabel(
    item.model ??
      (defined === undefined || defined === 'inherit' ? null : defined) ??
      activity.settings.model,
    item.effort,
    activity
  )
}

function modelLabel(
  model: string | null,
  effort: string | null,
  activity: SessionActivity
) {
  const name = activity.modelNames[model ?? 'default'] ?? model ?? 'Default'
  return effort === null
    ? name
    : `${name} · ${effort.charAt(0).toUpperCase()}${effort.slice(1)}`
}

export function runningTasks(activity: SessionActivity) {
  return Object.values(activity.tasks).filter((status) => status === 'running')
    .length
}

export function stageOf(agent: Agent) {
  const activity = agent.activity
  if (activity?.waiting === true) {
    return 0
  }
  if (activity?.running === true) {
    return 1
  }
  if (
    activity !== null &&
    (activity.holdsCompletion || runningTasks(activity) > 0)
  ) {
    return 2
  }
  if (agent.done) {
    return 3
  }
  return 4
}
