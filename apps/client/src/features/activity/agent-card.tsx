import {
  AiBrain01Icon,
  AlertDiamondIcon,
  BubbleChatIcon,
  BubbleChatIncomeIcon,
  CheckListIcon,
  CommandLineIcon,
  FilePenIcon,
  Globe02Icon,
  HelpCircleIcon,
  InformationCircleIcon,
  ListTodoIcon,
  Mail01Icon,
  Minimize02Icon,
  UserIcon,
  Wrench01Icon,
  ZapIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { BranchIcon, WorktreeIcon } from '@offsite/core/icons/git'
import type { Item } from '@offsite/core/items'
import type { SessionActivity } from '@offsite/core/sessions'
import type { ReactNode } from 'react'
import { ProviderIcon } from '@/components/icons'
import { SessionStatus } from '@/features/sidebar/session-status'
import {
  AgentSpinner,
  agentOf,
  SubagentIcon,
} from '@/features/transcript/agent-pill'
import { taskTitle, threadTasks } from '@/features/transcript/tasks'
import { summary } from '@/features/transcript/tool-details'
import { subtitleOf, toolTitle } from '@/features/transcript/tool-parts'
import { providerNames, timeAgo, timeLeft } from '@/lib/format'
import { openSession } from '@/lib/sessions'
import { type MachineSession, placePathOf, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { AgentRequest } from './agent-request'

export type Agent = {
  session: MachineSession
  activity: SessionActivity | null
  done: boolean
  account: string | null
  model: string | null
}

export function AgentCard(props: { agent: Agent; now: number }) {
  const session = props.agent.session
  const activity = props.agent.activity
  const cwd = useStore(
    (state) =>
      placePathOf(
        state,
        session.machine,
        session.projectId,
        session.worktreeId
      ) ?? ''
  )
  const stage = stageOf(props.agent)
  const request = activity?.requests.at(0)

  function open() {
    openSession({
      machine: session.machine,
      projectId: session.projectId,
      worktreeId: session.worktreeId,
      sessionId: session.id,
      pending: null,
    })
  }

  return (
    <article
      id={cardId(session)}
      className={cn(
        'bg-background flex flex-col gap-2 rounded-lg border p-3 text-xs',
        stage === 0 && 'border-question/50 bg-question/5',
        (stage === 1 || stage === 2) && 'border-info/30',
        stage === 3 && 'border-success/30',
        stage === 4 && 'border-border'
      )}
    >
      <button
        className="flex min-w-0 cursor-pointer items-start gap-2 text-left"
        onClick={open}
      >
        <span className="empty:before:bg-muted-foreground/40 grid h-5 w-4 shrink-0 place-items-center empty:before:size-2 empty:before:rounded-full empty:before:content-['']">
          <SessionStatus
            session={session}
            activity={activity ?? undefined}
            done={props.agent.done}
          />
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm leading-5 font-medium',
            stage === 4 ? 'text-foreground/70' : 'text-foreground'
          )}
        >
          {session.title}
        </span>
        <span className="text-muted-foreground shrink-0 leading-5 tabular-nums">
          {activity !== null && activity.workingSince !== null
            ? timeLeft(props.now - activity.workingSince)
            : timeAgo(session.updatedAt)}
        </span>
      </button>
      {activity !== null && (
        <AgentWork activity={activity} cwd={cwd} now={props.now} />
      )}
      <AgentFooter agent={props.agent} />
      {request !== undefined && (
        <AgentRequest
          machine={session.machine}
          sessionId={session.id}
          request={request}
          cwd={cwd}
          onOpen={open}
        />
      )}
    </article>
  )
}

function AgentWork(props: {
  activity: SessionActivity
  cwd: string
  now: number
}) {
  const activity = props.activity
  const found = threadTasks(activity.work, activity)
  const running = [
    ...found.agents
      .filter((item) => item.status === 'Running')
      .map((item) => ({
        id: item.item.id,
        icon: <AgentSpinner className={agentOf(item.item).tone} />,
        title: item.item.description,
        model: subagentModel(item.item, activity),
        time: item.item.time,
      })),
    ...found.tasks
      .filter((item) => item.status === 'Running')
      .map((item) => ({
        id: item.item.id,
        icon: (
          <HugeiconsIcon
            icon={CommandLineIcon}
            className="text-info size-3.5"
          />
        ),
        title: taskTitle(item.item),
        model: null,
        time: item.item.time,
      })),
  ]
  const step =
    activity.step === null ||
    running.some((item) => item.id === activity.step?.id)
      ? null
      : stepOf(activity.step, props.cwd)

  if (step === null && running.length === 0) {
    return null
  }
  return (
    <div className="flex flex-col gap-2 pl-6">
      {running.length > 0 && (
        <ul className="flex flex-col gap-1">
          {running.map((item) => (
            <WorkRow
              key={item.id}
              icon={item.icon}
              title={item.title}
              model={item.model}
              time={item.time}
              now={props.now}
            />
          ))}
        </ul>
      )}
      {step !== null && (
        <p className="text-muted-foreground flex min-w-0 items-start gap-2">
          <span className="grid size-4 shrink-0 place-items-center">
            {step.icon}
          </span>
          <span className="line-clamp-2 min-w-0 wrap-anywhere">
            {step.label !== '' && (
              <span className="text-foreground/80">{step.label} </span>
            )}
            {step.detail}
          </span>
        </p>
      )}
    </div>
  )
}

function AgentFooter(props: { agent: Agent }) {
  const session = props.agent.session
  const activity = props.agent.activity
  const model = props.agent.model

  return (
    <p className="text-muted-foreground flex min-w-0 items-center gap-3 pl-6">
      <span className="flex min-w-0 shrink-0 items-center gap-1.5">
        <ProviderIcon provider={session.provider} className="size-3.5" />
        <span className="max-w-32 truncate">
          {props.agent.account ?? providerNames[session.provider]}
        </span>
        {model !== null && (
          <ModelBadge
            label={model}
            context={
              activity === null ||
              activity.context === null ||
              activity.context.window === null
                ? null
                : Math.round(
                    (activity.context.tokens / activity.context.window) * 100
                  )
            }
          />
        )}
      </span>
      {session.branch !== null && (
        <span className="ml-auto flex min-w-0 items-center gap-1">
          <HugeiconsIcon
            icon={session.worktreeId === null ? BranchIcon : WorktreeIcon}
            className="size-3.5 shrink-0"
          />
          <span className="truncate">{session.branch}</span>
        </span>
      )}
    </p>
  )
}

function WorkRow(props: {
  icon: ReactNode
  title: string
  model: string | null
  time: number | null
  now: number
}) {
  return (
    <li className="flex h-6 min-w-0 items-center gap-2">
      <span className="grid size-4 shrink-0 place-items-center">
        {props.icon}
      </span>
      <span className="text-foreground/90 min-w-0 flex-1 truncate">
        {props.title}
      </span>
      {props.model !== null && (
        <span className="text-muted-foreground max-w-24 shrink-0 truncate">
          {props.model}
        </span>
      )}
      {props.time !== null && (
        <span className="text-muted-foreground shrink-0 tabular-nums">
          {timeLeft(props.now - props.time)}
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
      return {
        icon: glyph(CommandLineIcon),
        label: toolTitle(item),
        detail: summary(item, cwd),
      }
    case 'file_change':
      return {
        icon: glyph(FilePenIcon),
        label: toolTitle(item),
        detail: summary(item, cwd),
      }
    case 'web_search':
      return {
        icon: glyph(Globe02Icon),
        label: toolTitle(item),
        detail: summary(item, cwd),
      }
    case 'skill':
      return {
        icon: glyph(ZapIcon),
        label: toolTitle(item),
        detail: summary(item, cwd),
      }
    case 'tool':
      return {
        icon: glyph(Wrench01Icon),
        label: toolTitle(item),
        detail: subtitleOf(item, cwd),
      }
    case 'assistant':
      return {
        icon: glyph(BubbleChatIcon),
        label: '',
        detail: item.text.trim().split('\n').at(-1) ?? '',
      }
    case 'reasoning':
      return { icon: glyph(AiBrain01Icon), label: 'Thinking', detail: '' }
    case 'subagent':
      return {
        icon: <SubagentIcon className={cn('size-3.5', agentOf(item).tone)} />,
        label: agentOf(item).name,
        detail: item.description,
      }
    case 'agent_message':
      return { icon: glyph(Mail01Icon), label: 'Message', detail: item.summary }
    case 'received_message':
      return {
        icon: glyph(BubbleChatIncomeIcon),
        label: item.sender,
        detail: item.text,
      }
    case 'question':
      return {
        icon: glyph(HelpCircleIcon),
        label: 'Asked',
        detail: item.questions[0]?.question ?? '',
      }
    case 'plan':
      return {
        icon: glyph(ListTodoIcon),
        label: 'Plan',
        detail: item.plan.split('\n')[0],
      }
    case 'compaction':
      return { icon: glyph(Minimize02Icon), label: 'Compacted', detail: '' }
    case 'notice':
      return {
        icon: glyph(InformationCircleIcon),
        label: 'Notice',
        detail: item.text,
      }
    case 'error':
      return {
        icon: glyph(AlertDiamondIcon),
        label: 'Error',
        detail: item.text,
      }
    case 'user':
      return { icon: glyph(UserIcon), label: 'You', detail: item.text }
    case 'todo_list':
      return { icon: glyph(CheckListIcon), label: 'Updated todos', detail: '' }
  }
}

function glyph(icon: IconSvgElement) {
  return <HugeiconsIcon icon={icon} className="size-3.5" />
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

export function modelLabel(
  model: string | null,
  effort: string | null,
  activity: SessionActivity
) {
  const name = activity.modelNames[model ?? 'default'] ?? model ?? 'Default'
  return effort === null
    ? name
    : `${name} · ${effort.charAt(0).toUpperCase()}${effort.slice(1)}`
}

export function cardId(session: MachineSession) {
  return `activity-${session.machine}-${session.id}`
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
