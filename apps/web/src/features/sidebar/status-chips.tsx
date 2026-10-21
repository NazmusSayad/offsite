import {
  Alert02Icon,
  AlertCircleIcon,
  CircleCheckIcon,
  ShieldQuestionMarkIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { machineKey } from '@/api/machines'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { openSession } from '@/lib/sessions'
import {
  activityOf,
  dismissErrors,
  type MachineSession,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'

export function StatusChips(props: { className?: string; hideDone: boolean }) {
  const errors = useStore((state) => state.errors)
  const machines = useStore((state) => state.machines)
  const sessions = useStore((state) => state.sessions)
  const unseen = useStore((state) => state.unseen)
  const offline = machines.filter(
    (machine) => machine.status === 'offline' || machine.status === 'unpaired'
  )
  const failed = sessions.filter((session) =>
    Object.values(
      activityOf(machines, session.machine, session.id)?.tasks ?? {}
    ).includes('failed')
  )
  const waiting = sessions.filter(
    (session) =>
      activityOf(machines, session.machine, session.id)?.waiting === true
  )
  const done = sessions.filter((session) => {
    const activity = activityOf(machines, session.machine, session.id)
    return (
      unseen.includes(machineKey(session.machine, session.id)) &&
      activity?.waiting !== true &&
      activity?.running !== true &&
      !Object.values(activity?.tasks ?? {}).includes('running')
    )
  })
  const problems = errors.length + offline.length + failed.length
  const showDone = !props.hideDone && done.length > 0
  if (problems === 0 && waiting.length === 0 && !showDone) {
    return null
  }
  return (
    <div className={cn('flex shrink-0 items-center gap-1', props.className)}>
      {showDone && (
        <Chip
          className="bg-success/15 text-success"
          icon={CircleCheckIcon}
          count={done.length}
          label={`${done.length} done`}
        >
          {done.map((session) => (
            <Thread
              key={machineKey(session.machine, session.id)}
              session={session}
              icon={CircleCheckIcon}
              className="text-success"
              detail="Done"
            />
          ))}
        </Chip>
      )}
      {waiting.length > 0 && (
        <Chip
          className="bg-question/15 text-question"
          icon={ShieldQuestionMarkIcon}
          count={waiting.length}
          label={`${waiting.length} waiting for approval`}
        >
          {waiting.map((session) => (
            <Thread
              key={machineKey(session.machine, session.id)}
              session={session}
              icon={ShieldQuestionMarkIcon}
              className="text-question"
              detail="Waiting for approval"
            />
          ))}
        </Chip>
      )}
      {problems > 0 && (
        <Chip
          className={cn(
            errors.length > 0 && 'bg-error/15 text-error',
            errors.length === 0 && 'bg-warning/15 text-warning-foreground'
          )}
          icon={errors.length > 0 ? AlertCircleIcon : Alert02Icon}
          count={problems}
          label={problems === 1 ? '1 problem' : `${problems} problems`}
          onClose={dismissErrors}
        >
          {errors.map((error, index) => (
            <Row key={index} icon={AlertCircleIcon} className="text-error">
              <span className="text-error-foreground whitespace-pre-wrap">
                {error}
              </span>
            </Row>
          ))}
          {offline.map((machine) => (
            <Row
              key={machine.id}
              icon={Alert02Icon}
              className="text-warning-foreground"
            >
              {machine.status === 'offline' && `${machine.name} is offline`}
              {machine.status === 'unpaired' && `${machine.name} needs pairing`}
            </Row>
          ))}
          {failed.map((session) => (
            <Thread
              key={machineKey(session.machine, session.id)}
              session={session}
              icon={Alert02Icon}
              className="text-warning-foreground"
              detail="Background task failed"
            />
          ))}
        </Chip>
      )}
    </div>
  )
}

function Chip(props: {
  className: string
  icon: typeof AlertCircleIcon
  count: number
  label: string
  onClose?: () => void
  children: ReactNode
}) {
  return (
    <Popover onOpenChange={(open) => !open && props.onClose?.()}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex h-5 shrink-0 cursor-pointer items-center gap-0.75 rounded-[6px] px-1.25 text-[11px] font-medium tabular-nums',
            props.className
          )}
          title={props.label}
          aria-label={props.label}
        >
          <HugeiconsIcon icon={props.icon} className="size-3 shrink-0" />
          {props.count}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="flex max-h-80 w-[min(20rem,calc(100vw-2rem))] flex-col gap-px overflow-y-auto p-1 text-sm"
      >
        {props.children}
      </PopoverContent>
    </Popover>
  )
}

function Row(props: {
  icon: typeof AlertCircleIcon
  className: string
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-2 px-2 py-1.5">
      <HugeiconsIcon
        icon={props.icon}
        className={cn('mt-0.5 size-4 shrink-0', props.className)}
      />
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  )
}

function Thread(props: {
  session: MachineSession
  icon: typeof AlertCircleIcon
  className: string
  detail: string
}) {
  return (
    <PopoverPrimitive.Close asChild>
      <button
        className="hover:bg-accent cursor-pointer rounded-md text-left"
        onClick={() =>
          openSession({
            machine: props.session.machine,
            projectId: props.session.projectId,
            sessionId: props.session.id,
          })
        }
      >
        <Row icon={props.icon} className={props.className}>
          <div className="text-foreground truncate">{props.session.title}</div>
          <div className="text-muted-foreground text-xs">{props.detail}</div>
        </Row>
      </button>
    </PopoverPrimitive.Close>
  )
}
