import {
  Alert02Icon,
  AlertCircleIcon,
  CircleCheckIcon,
  ShieldQuestionMarkIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
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
  threadState,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'

export function StatusChips(props: {
  className?: string
  hideDone: boolean
  combine?: 'threads' | 'all'
}) {
  const errors = useStore((state) => state.errors)
  const machines = useStore((state) => state.machines)
  const sessions = useStore((state) => state.sessions)
  const unseen = useStore((state) => state.unseen)
  const offline = machines.filter(
    (machine) => machine.status === 'offline' || machine.status === 'unpaired'
  )
  const waiting = sessions.filter(
    (session) =>
      activityOf(machines, session.machine, session.id)?.waiting === true
  )
  const done = sessions.filter(
    (session) =>
      threadState(
        activityOf(machines, session.machine, session.id),
        unseen.includes(machineKey(session.machine, session.id))
      ).done
  )
  const problems = errors.length + offline.length
  const showDone = !props.hideDone && done.length > 0
  if (problems === 0 && waiting.length === 0 && !showDone) {
    return null
  }
  if (props.combine === 'all') {
    return (
      <div className={cn('flex shrink-0 items-center', props.className)}>
        <Chip
          className={cn(
            errors.length > 0 && 'bg-error/15 text-error',
            errors.length === 0 &&
              offline.length > 0 &&
              'bg-warning/15 text-warning-foreground',
            problems === 0 &&
              waiting.length > 0 &&
              'bg-question/15 text-question',
            problems === 0 &&
              waiting.length === 0 &&
              'bg-success/15 text-success'
          )}
          icon={
            (errors.length > 0 && AlertCircleIcon) ||
            (offline.length > 0 && Alert02Icon) ||
            (waiting.length > 0 && ShieldQuestionMarkIcon) ||
            CircleCheckIcon
          }
          count={problems + waiting.length + (showDone ? done.length : 0)}
          label={[
            problems === 1 && '1 problem',
            problems > 1 && `${problems} problems`,
            waiting.length > 0 && `${waiting.length} waiting for approval`,
            showDone && `${done.length} done`,
          ]
            .filter(Boolean)
            .join(', ')}
          onClose={dismissErrors}
        >
          <ChipList kind="all" />
        </Chip>
      </div>
    )
  }
  const merged = props.combine === 'threads' && showDone && waiting.length > 0

  return (
    <div className={cn('flex shrink-0 items-center gap-1', props.className)}>
      {merged && (
        <Chip
          className="bg-question/15 text-question"
          icon={ShieldQuestionMarkIcon}
          count={waiting.length + done.length}
          label={`${waiting.length} waiting for approval, ${done.length} done`}
        >
          <ChipList kind="merged" />
        </Chip>
      )}
      {!merged && showDone && (
        <Chip
          className="bg-success/15 text-success"
          icon={CircleCheckIcon}
          count={done.length}
          label={`${done.length} done`}
        >
          <ChipList kind="done" />
        </Chip>
      )}
      {!merged && waiting.length > 0 && (
        <Chip
          className="bg-question/15 text-question"
          icon={ShieldQuestionMarkIcon}
          count={waiting.length}
          label={`${waiting.length} waiting for approval`}
        >
          <ChipList kind="waiting" />
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
          <ChipList kind="problems" />
        </Chip>
      )}
    </div>
  )
}

export function FittedStatusChips() {
  const slot = useRef<HTMLDivElement>(null)
  const full = useRef<HTMLDivElement>(null)
  const threads = useRef<HTMLDivElement>(null)
  const all = useRef<HTMLDivElement>(null)
  const [combine, setCombine] = useState<'none' | 'threads' | 'all'>('none')
  const [minWidth, setMinWidth] = useState(0)

  useLayoutEffect(() => {
    if (
      slot.current === null ||
      full.current === null ||
      threads.current === null ||
      all.current === null
    ) {
      throw new Error('Status chips are not mounted')
    }
    const elements = {
      slot: slot.current,
      full: full.current,
      threads: threads.current,
      all: all.current,
    }
    const observer = new ResizeObserver(() => {
      const width = elements.slot.clientWidth
      setMinWidth(elements.all.offsetWidth)
      if (elements.full.offsetWidth <= width) {
        setCombine('none')
        return
      }
      if (elements.threads.offsetWidth <= width) {
        setCombine('threads')
        return
      }
      setCombine('all')
    })
    for (const element of Object.values(elements)) {
      observer.observe(element)
    }
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={slot}
      className="relative flex flex-1 justify-end"
      style={{ minWidth }}
    >
      <div
        aria-hidden
        className="pointer-events-none invisible absolute right-0 flex w-max"
      >
        <div ref={full}>
          <StatusChips hideDone={false} />
        </div>
        <div ref={threads}>
          <StatusChips hideDone={false} combine="threads" />
        </div>
        <div ref={all}>
          <StatusChips hideDone={false} combine="all" />
        </div>
      </div>
      <StatusChips
        hideDone={false}
        combine={combine === 'none' ? undefined : combine}
      />
    </div>
  )
}

function ChipList(props: {
  kind: 'done' | 'waiting' | 'merged' | 'problems' | 'all'
}) {
  const errors = useStore((state) => state.errors)
  const machines = useStore((state) => state.machines)
  const sessions = useStore((state) => state.sessions)
  const unseen = useStore((state) => state.unseen)
  const offline = machines.filter(
    (machine) => machine.status === 'offline' || machine.status === 'unpaired'
  )
  const waiting = sessions.filter(
    (session) =>
      activityOf(machines, session.machine, session.id)?.waiting === true
  )
  const done = sessions.filter(
    (session) =>
      threadState(
        activityOf(machines, session.machine, session.id),
        unseen.includes(machineKey(session.machine, session.id))
      ).done
  )
  const doneRows = done.map((session) => (
    <Thread
      key={machineKey(session.machine, session.id)}
      session={session}
      icon={CircleCheckIcon}
      className="text-success"
      detail="Done"
    />
  ))
  const waitingRows = waiting.map((session) => (
    <Thread
      key={machineKey(session.machine, session.id)}
      session={session}
      icon={ShieldQuestionMarkIcon}
      className="text-question"
      detail="Waiting for approval"
    />
  ))
  const problemRows = (
    <>
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
    </>
  )
  if (props.kind === 'done') {
    return doneRows
  }
  if (props.kind === 'waiting') {
    return waitingRows
  }
  if (props.kind === 'merged') {
    return (
      <>
        {waitingRows}
        {doneRows}
      </>
    )
  }
  if (props.kind === 'problems') {
    return problemRows
  }
  if (props.kind === 'all') {
    return (
      <>
        {problemRows}
        {waitingRows}
        {doneRows}
      </>
    )
  }
  throw new Error('Unknown chip list')
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
