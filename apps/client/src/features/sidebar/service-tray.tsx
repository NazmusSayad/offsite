import {
  CircleDotDashedIcon,
  Download01Icon,
  ReloadIcon,
} from '@hugeicons/core-free-icons'
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

export function ServiceTray(props: { machines: Machine[] }) {
  return (
    <ul className="animate-in fade-in slide-in-from-top-1 flex flex-col pb-2 duration-150">
      {props.machines.map((machine) => (
        <li
          key={machine.id}
          className="border-sidebar-border/60 mr-2 ml-[2.125rem] border-t py-2 first:border-t-0 first:pt-1"
        >
          <ServiceInstall machine={machine} />
        </li>
      ))}
    </ul>
  )
}

export function UpdateLine(props: { machine: Machine }) {
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
            <HugeiconsIcon
              icon={starting ? CircleDotDashedIcon : Download01Icon}
              className={cn(starting && 'animate-spin')}
            />
            Update
          </Button>
        }
      />
      <TaskError error={error} />
    </>
  )
}

export function RestartLine(props: { machine: Machine }) {
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
            {working || (busy === null && error === null) ? (
              <HugeiconsIcon
                icon={CircleDotDashedIcon}
                className="animate-spin"
              />
            ) : (
              <HugeiconsIcon icon={ReloadIcon} />
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
