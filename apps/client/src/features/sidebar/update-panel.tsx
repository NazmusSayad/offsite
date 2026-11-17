import {
  ArrowDown01Icon,
  BrowserIcon,
  CircleDotDashedIcon,
  Download01Icon,
  ReloadIcon,
  ServerIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { useBusyReasons } from '@/features/service/busy-reasons'
import { TaskBusy, TaskError } from '@/features/sidebar/service-task-parts'
import { applyBrowserUpdate } from '@/lib/browser-update'
import { type Machine, showError } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

export function UpdatePanel(props: {
  kind: 'update' | 'restart'
  browser: boolean
  machines: Machine[]
}) {
  const [open, setOpen] = useState(false)
  const [working, setWorking] = useState(false)
  const [busy, setBusy] = useState<Record<string, string[]>>({})
  const ids = props.machines.map((machine) => machine.id).join(' ')
  const count = props.machines.length + (props.browser ? 1 : 0)
  const waiting = props.machines.filter(
    (machine) => machine.service?.update?.status === 'available'
  )
  const safe = props.machines.filter(
    (machine) => busy[machine.id]?.length === 0
  )
  const pending =
    props.kind === 'update'
      ? waiting.length + (props.browser ? 1 : 0)
      : safe.length
  const action = !open && (pending > 0 || working)
  const downloads = props.machines.flatMap((machine) =>
    machine.service?.update?.status === 'downloading'
      ? [machine.service.update.percent]
      : []
  )

  useEffect(() => {
    if (props.kind !== 'restart') {
      return
    }
    let active = true
    void Promise.allSettled(
      ids
        .split(' ')
        .map(
          async (id) => [id, await call(id, 'service.busy', undefined)] as const
        )
    ).then((results) => {
      if (active) {
        setBusy(
          Object.fromEntries(
            results.flatMap((result) =>
              result.status === 'fulfilled' ? [result.value] : []
            )
          )
        )
      }
    })
    return () => {
      active = false
    }
  }, [props.kind, ids])

  async function update() {
    setWorking(true)
    const results = await Promise.allSettled(
      waiting.map((machine) => call(machine.id, 'service.update', undefined))
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        showError(result.reason)
      }
    }
    if (props.browser) {
      try {
        await applyBrowserUpdate()
      } catch (error) {
        showError(error)
      }
    }
    setWorking(false)
  }

  async function restart() {
    setWorking(true)
    const results = await Promise.allSettled(
      safe.map(async (machine) => {
        const reasons = await call(machine.id, 'service.busy', undefined)
        if (reasons.length > 0) {
          return false
        }
        await call(machine.id, 'service.restart', undefined)
        toast.info(`OffSite - ${machine.name} is restarting`)
        return true
      })
    )
    for (const result of results) {
      if (result.status === 'rejected') {
        showError(result.reason)
      }
    }
    if (
      results.some((result) => result.status === 'fulfilled' && !result.value)
    ) {
      setOpen(true)
    }
    setWorking(false)
  }

  if (count === 1) {
    return (
      <div
        className={cn(
          'rounded-r-md border-l-2 bg-linear-to-r to-transparent pr-1.5 pl-2.5',
          props.kind === 'update' &&
            'border-success from-success/18 text-success',
          props.kind === 'restart' && 'border-info from-info/18 text-info'
        )}
      >
        {props.browser ? (
          <BrowserRow />
        ) : (
          <MachineRow machine={props.machines[0]} />
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'overflow-hidden rounded-r-md border-l-2 bg-linear-to-r to-transparent transition-colors',
        props.kind === 'update' &&
          'border-success from-success/18 text-success',
        props.kind === 'restart' && 'border-info from-info/18 text-info',
        open && 'bg-sidebar-accent/50'
      )}
    >
      <div className="group flex h-8 items-center gap-2 pr-1.5 transition-colors hover:bg-white/4">
        <button
          type="button"
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 self-stretch pl-2.5 text-left"
          onClick={() => setOpen(!open)}
        >
          {props.kind === 'restart' && (
            <HugeiconsIcon icon={ReloadIcon} className="size-4 shrink-0" />
          )}
          {props.kind === 'update' &&
            (downloads.length > 0 ? (
              <Progress percent={downloads[0]} />
            ) : (
              <HugeiconsIcon
                icon={Download01Icon}
                className="size-4 shrink-0"
              />
            ))}
          <span className="text-sidebar-foreground min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
            {props.kind === 'update' ? 'Updates' : 'Restarts'}
          </span>
          {!action && (
            <span className="text-sidebar-foreground bg-sidebar-foreground/10 rounded-full px-1.5 text-[0.6875rem] font-medium tabular-nums">
              {count}
            </span>
          )}
        </button>
        {action && (
          <Button
            type="button"
            size="xs"
            variant="secondary"
            className="h-6"
            disabled={working}
            onClick={() =>
              void (props.kind === 'update' ? update() : restart())
            }
          >
            <HugeiconsIcon
              icon={
                working
                  ? CircleDotDashedIcon
                  : props.kind === 'update'
                    ? Download01Icon
                    : ReloadIcon
              }
              className={cn(working && 'animate-spin')}
            />
            {working && props.kind === 'update' && 'Updating'}
            {working && props.kind === 'restart' && 'Restarting'}
            {!working && props.kind === 'update' && `Update ${pending}`}
            {!working &&
              props.kind === 'restart' &&
              safe.length === props.machines.length &&
              `Restart ${safe.length}`}
            {!working &&
              props.kind === 'restart' &&
              safe.length < props.machines.length &&
              `Restart ${safe.length}/${props.machines.length}`}
          </Button>
        )}
        <span
          className="flex items-center self-stretch"
          onClick={() => setOpen(!open)}
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              'text-muted-foreground group-hover:text-sidebar-foreground size-3.5 shrink-0 transition-transform duration-200',
              open && 'rotate-180'
            )}
          />
        </span>
      </div>
      {open && (
        <ul className="animate-in fade-in slide-in-from-top-1 text-muted-foreground flex flex-col pr-1.5 pb-1.5 pl-2.5 duration-150">
          {props.browser && (
            <li>
              <BrowserRow />
            </li>
          )}
          {props.machines.map((machine) => (
            <li key={machine.id}>
              <MachineRow machine={machine} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Row(props: {
  icon: typeof ServerIcon
  label: string
  version: string | null
  action: ReactNode
}) {
  return (
    <div className="flex h-8 items-center gap-2">
      <HugeiconsIcon icon={props.icon} className="size-4 shrink-0" />
      <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="text-sidebar-foreground truncate text-[0.8125rem] font-medium">
          {props.label}
        </span>
        {props.version !== null && (
          <span className="text-muted-foreground shrink-0 text-[0.6875rem] tabular-nums">
            {props.version}
          </span>
        )}
      </span>
      {props.action}
    </div>
  )
}

function BrowserRow() {
  const [updating, setUpdating] = useState(false)

  return (
    <Row
      icon={BrowserIcon}
      label="Browser"
      version={null}
      action={
        <Button
          type="button"
          size="xs"
          variant="secondary"
          className="h-6"
          disabled={updating}
          onClick={async () => {
            setUpdating(true)
            try {
              await applyBrowserUpdate()
            } catch (error) {
              showError(error)
              setUpdating(false)
            }
          }}
        >
          <HugeiconsIcon
            icon={updating ? CircleDotDashedIcon : Download01Icon}
            className={cn(updating && 'animate-spin')}
          />
          {updating ? 'Updating' : 'Update'}
        </Button>
      }
    />
  )
}

function MachineRow(props: { machine: Machine }) {
  const update = props.machine.service?.update ?? null
  if (update === null) {
    throw new Error(`no update for ${props.machine.name}`)
  }
  if (update.status === 'ready') {
    return <RestartRow machine={props.machine} version={update.version} />
  }
  if (update.status === 'downloading') {
    return (
      <Row
        icon={ServerIcon}
        label={props.machine.name}
        version={update.version}
        action={
          <span className="text-success flex h-6 items-center gap-1.5 px-1 text-xs font-medium tabular-nums">
            <Progress percent={update.percent} />
            {update.percent !== null && `${Math.round(update.percent)}%`}
          </span>
        }
      />
    )
  }
  return <DownloadRow machine={props.machine} version={update.version} />
}

function DownloadRow(props: { machine: Machine; version: string }) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function download() {
    setStarting(true)
    setError(null)
    try {
      await call(props.machine.id, 'service.update', undefined)
    } catch (failure) {
      setError(errorMessage(failure))
    }
    setStarting(false)
  }

  return (
    <>
      <Row
        icon={ServerIcon}
        label={props.machine.name}
        version={props.version}
        action={
          <Button
            type="button"
            size="xs"
            variant="secondary"
            className="h-6"
            disabled={starting}
            onClick={() => void download()}
          >
            <HugeiconsIcon
              icon={starting ? CircleDotDashedIcon : Download01Icon}
              className={cn(starting && 'animate-spin')}
            />
            Update
          </Button>
        }
      />
      <div className="mb-1.5 empty:hidden">
        <TaskError error={error} />
      </div>
    </>
  )
}

function RestartRow(props: { machine: Machine; version: string }) {
  const machine = props.machine
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useBusyReasons(machine.id, setError)

  async function restart() {
    setWorking(true)
    setError(null)
    try {
      await call(machine.id, 'service.restart', undefined)
      toast.info(`OffSite - ${machine.name} is restarting`)
    } catch (failure) {
      setError(errorMessage(failure))
      setWorking(false)
    }
  }

  return (
    <>
      <Row
        icon={ServerIcon}
        label={props.machine.name}
        version={props.version}
        action={
          <Button
            type="button"
            size="xs"
            variant={
              busy !== null && busy.length > 0 ? 'destructive' : 'secondary'
            }
            className="h-6"
            disabled={working || busy === null}
            onClick={() => void restart()}
          >
            <HugeiconsIcon
              icon={
                working || (busy === null && error === null)
                  ? CircleDotDashedIcon
                  : ReloadIcon
              }
              className={cn(
                (working || (busy === null && error === null)) && 'animate-spin'
              )}
            />
            {working ? 'Restarting' : 'Restart'}
          </Button>
        }
      />
      <div className="mb-1.5 empty:hidden">
        <TaskBusy busy={busy} />
        <TaskError error={error} />
      </div>
    </>
  )
}

function Progress(props: { percent: number | null }) {
  if (props.percent === null) {
    return (
      <HugeiconsIcon
        icon={CircleDotDashedIcon}
        className="size-4 shrink-0 animate-spin"
      />
    )
  }

  return (
    <svg viewBox="0 0 16 16" className="size-4 shrink-0 -rotate-90">
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        strokeWidth="2"
        className="stroke-current opacity-25"
      />
      <circle
        cx="8"
        cy="8"
        r="6"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray={`${props.percent} 100`}
        className="stroke-current transition-[stroke-dasharray] duration-500"
      />
    </svg>
  )
}
