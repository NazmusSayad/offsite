import { CircleDotDashedIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { BusyReasons, useBusyReasons } from '@/features/service/busy-reasons'
import { useStore } from '@/lib/store'
import { errorMessage } from '@/lib/utils'

export function UpdateForm(props: {
  machine: string
  onDone: () => void
  onCancel?: () => void
}) {
  const machine = useStore((state) =>
    state.machines.find((item) => item.id === props.machine)
  )
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const update = machine?.service?.update ?? null

  if (machine === undefined || machine.service === null) {
    return (
      <p className="text-muted-foreground text-sm">This machine is offline</p>
    )
  }
  if (update === null) {
    return (
      <p className="text-muted-foreground text-sm">OffSite is up to date</p>
    )
  }
  if (update.status === 'ready') {
    return (
      <RestartForm
        machine={props.machine}
        version={update.version}
        onDone={props.onDone}
      />
    )
  }
  if (update.status === 'downloading') {
    return (
      <div className="flex flex-col gap-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <HugeiconsIcon
            icon={CircleDotDashedIcon}
            className="text-info size-4 shrink-0 animate-spin"
          />
          Downloading OffSite {update.version}…
          {update.percent !== null && (
            <span className="text-muted-foreground ml-auto tabular-nums">
              {Math.round(update.percent)}%
            </span>
          )}
        </p>
        {update.percent !== null && (
          <div className="bg-muted h-1.5 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-[width]"
              style={{ width: `${update.percent}%` }}
            />
          </div>
        )}
        {update.output !== null && (
          <p
            className="text-muted-foreground truncate font-mono text-xs"
            title={update.output}
          >
            {update.output}
          </p>
        )}
        <p className="text-muted-foreground">
          This runs in the background, so you can keep working. OffSite asks
          before it restarts.
        </p>
      </div>
    )
  }

  async function download() {
    setStarting(true)
    setError(null)
    try {
      await call(props.machine, 'service.update', undefined)
    } catch (failure) {
      setError(errorMessage(failure))
    }
    setStarting(false)
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>OffSite {update.version} is available.</p>
      <p className="text-muted-foreground">
        It downloads in the background, so you can keep working. OffSite asks
        before it restarts.
      </p>
      {error !== null && (
        <p className="text-destructive wrap-anywhere">{error}</p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        {props.onCancel !== undefined && (
          <Button type="button" variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          disabled={starting}
          onClick={() => void download()}
        >
          Update
        </Button>
      </div>
    </div>
  )
}

function RestartForm(props: {
  machine: string
  version: string
  onDone: () => void
}) {
  const name = useStore(
    (state) => state.machines.find((item) => item.id === props.machine)?.name
  )
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useBusyReasons(props.machine, setError)

  async function restart() {
    setWorking(true)
    setError(null)
    try {
      await call(props.machine, 'service.restart', undefined)
      toast(`OffSite - ${name} is restarting`)
    } catch (failure) {
      setError(errorMessage(failure))
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>
        OffSite {props.version} is downloaded. Restart to apply it now, or later
        when you are done.
      </p>
      <BusyReasons busy={busy} />
      {error !== null && (
        <p className="text-destructive wrap-anywhere">{error}</p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={props.onDone}>
          Later
        </Button>
        <Button
          type="button"
          variant={busy !== null && busy.length > 0 ? 'destructive' : 'default'}
          disabled={working || busy === null}
          onClick={() => void restart()}
        >
          {working ? 'Restarting…' : 'Restart now'}
        </Button>
      </div>
    </div>
  )
}
