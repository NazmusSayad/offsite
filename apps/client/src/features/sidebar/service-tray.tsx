import { CircleDotDashedIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { useBusyReasons } from '@/features/service/busy-reasons'
import { ServiceInstall } from '@/features/sidebar/service-install'
import {
  TaskBusy,
  TaskError,
  TaskLine,
} from '@/features/sidebar/service-task-parts'
import type { Machine } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

export function ServiceTray(props: {
  kind: 'update' | 'restart' | 'install'
  machines: Machine[]
}) {
  return (
    <div className="animate-in fade-in slide-in-from-top-1 flex flex-col pb-2 duration-150">
      <ul className="flex flex-col">
        {props.machines.map((machine) => (
          <li
            key={machine.id}
            className="border-sidebar-border/60 mr-2 ml-[2.125rem] border-t py-2 first:border-t-0 first:pt-1"
          >
            {props.kind === 'update' && <UpdateLine machine={machine} />}
            {props.kind === 'restart' && <RestartLine machine={machine} />}
            {props.kind === 'install' && <ServiceInstall machine={machine} />}
          </li>
        ))}
      </ul>
      {props.kind === 'update' && (
        <p className="text-muted-foreground mr-2 ml-[2.125rem] text-xs">
          Downloads in the background. OffSite asks before restarting.
        </p>
      )}
    </div>
  )
}

function UpdateLine(props: { machine: Machine }) {
  const machine = props.machine
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const update = machine.service?.update ?? null
  if (update === null || update.status === 'ready') {
    return null
  }

  async function download() {
    setStarting(true)
    setError(null)
    try {
      await call(machine.id, 'service.update', undefined)
    } catch (failure) {
      setError(errorMessage(failure))
    }
    setStarting(false)
  }

  if (update.status === 'downloading') {
    return (
      <>
        <TaskLine
          name={machine.name}
          detail={`Downloading ${update.version}`}
          action={
            <span className="text-success flex items-center gap-1 text-xs font-medium tabular-nums">
              <HugeiconsIcon
                icon={CircleDotDashedIcon}
                className="size-3.5 animate-spin"
              />
              {update.percent !== null && `${Math.round(update.percent)}%`}
            </span>
          }
        />
        <div className="bg-sidebar-accent mt-1.5 h-1 overflow-hidden rounded-full">
          <div
            className={cn(
              'bg-success h-full rounded-full transition-[width]',
              update.percent === null && 'w-1/3 animate-pulse'
            )}
            style={
              update.percent === null
                ? undefined
                : { width: `${update.percent}%` }
            }
          />
        </div>
        {update.output !== null && (
          <p
            className="text-muted-foreground mt-1 truncate font-mono text-[0.6875rem]"
            title={update.output}
          >
            {update.output}
          </p>
        )}
        <TaskError error={error} />
      </>
    )
  }

  return (
    <>
      <TaskLine
        name={machine.name}
        detail={`${update.version} available`}
        action={
          <Button
            type="button"
            size="xs"
            disabled={starting}
            onClick={() => void download()}
          >
            {starting && (
              <HugeiconsIcon
                icon={CircleDotDashedIcon}
                className="animate-spin"
              />
            )}
            Update
          </Button>
        }
      />
      <TaskError error={error} />
    </>
  )
}

function RestartLine(props: { machine: Machine }) {
  const machine = props.machine
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useBusyReasons(machine.id, setError)
  if (machine.service?.update?.status !== 'ready') {
    return null
  }
  const name = machine.name

  async function restart() {
    setWorking(true)
    setError(null)
    try {
      await call(machine.id, 'service.restart', undefined)
      toast.info(`OffSite - ${name} is restarting`)
    } catch (failure) {
      setError(errorMessage(failure))
      setWorking(false)
    }
  }

  return (
    <>
      <TaskLine
        name={name}
        detail={`${machine.service.update.version} ready`}
        action={
          <Button
            type="button"
            size="xs"
            variant={
              busy !== null && busy.length > 0 ? 'destructive' : 'default'
            }
            disabled={working || busy === null}
            onClick={() => void restart()}
          >
            {(working || (busy === null && error === null)) && (
              <HugeiconsIcon
                icon={CircleDotDashedIcon}
                className="animate-spin"
              />
            )}
            {working ? 'Restarting' : 'Restart'}
          </Button>
        }
      />
      <TaskBusy busy={busy} />
      <TaskError error={error} />
    </>
  )
}
