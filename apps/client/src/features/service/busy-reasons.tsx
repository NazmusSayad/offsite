import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { errorMessage } from '@/lib/utils'

export function useBusyReasons(
  machine: string,
  onError: (error: string) => void
) {
  const [busy, setBusy] = useState<string[] | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const reasons = await call(machine, 'service.busy', undefined)
        if (active) {
          setBusy(reasons)
        }
      } catch (failure) {
        if (active) {
          onError(errorMessage(failure))
        }
      }
    })()
    return () => {
      active = false
    }
  }, [machine, onError])

  return busy
}

export function BusyReasons(props: { busy: string[] | null }) {
  if (props.busy === null || props.busy.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-destructive font-medium">Restarting stops:</p>
      <ul className="text-muted-foreground list-disc pl-5">
        {props.busy.map((reason, index) => (
          <li key={`${index} ${reason}`}>{reason}</li>
        ))}
      </ul>
    </div>
  )
}
