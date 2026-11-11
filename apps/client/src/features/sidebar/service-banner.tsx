import {
  type PackageManager,
  packageManagers,
  type ServiceState,
} from '@offsite/core/service'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useStore } from '@/lib/store'
import { errorMessage } from '@/lib/utils'

export function ServiceBanners() {
  const machines = useStore((state) => state.machines)
  const shown = machines.filter(
    (machine) =>
      machine.status === 'online' &&
      machine.service !== null &&
      (!machine.service.installed || machine.service.update !== null)
  )
  if (shown.length === 0) {
    return null
  }
  return (
    <div className="flex shrink-0 flex-col gap-2 px-(--sidebar-content-inset) pb-(--sidebar-content-inset)">
      {shown.map(
        (machine) =>
          machine.service !== null && (
            <ServiceBanner
              key={machine.id}
              machine={machine.id}
              name={machine.name}
              service={machine.service}
            />
          )
      )}
    </div>
  )
}

function ServiceBanner(props: {
  machine: string
  name: string
  service: ServiceState
}) {
  const [open, setOpen] = useState(false)
  const update = props.service.installed ? props.service.update : null

  return (
    <div className="border-sidebar-border rounded-lg border px-3 py-2.5 text-xs">
      <p className="text-sidebar-foreground font-medium">
        {update === null
          ? `Keep offsite running on ${props.name}`
          : `offsite ${update} is available`}
      </p>
      <p className="text-sidebar-muted-foreground mt-0.5">
        {update === null
          ? 'Start it at login and keep it updated.'
          : `Update ${props.name} now, or it updates itself once nothing is running.`}
      </p>
      <Button size="xs" className="mt-2.5" onClick={() => setOpen(true)}>
        {update === null ? 'Install' : 'Update now'}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <ServiceDialog
            machine={props.machine}
            name={props.name}
            update={update}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ServiceDialog(props: {
  machine: string
  name: string
  update: string | null
  onClose: () => void
}) {
  const [manager, setManager] = useState<PackageManager | null>(null)
  const [busy, setBusy] = useState<string[] | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const installing = props.update === null

  useEffect(() => {
    let current = true
    void (async () => {
      try {
        const reasons = await call(props.machine, 'service.busy', undefined)
        if (current) {
          setBusy(reasons)
        }
      } catch (failure) {
        if (current) {
          setError(errorMessage(failure))
        }
      }
    })()
    return () => {
      current = false
    }
  }, [props.machine])

  async function confirm() {
    setWorking(true)
    setError(null)
    try {
      if (installing) {
        if (manager === null) {
          throw new Error('Pick a package manager first')
        }
        await call(props.machine, 'service.install', { manager })
      } else {
        await call(props.machine, 'service.update', undefined)
      }
      props.onClose()
      toast(`${props.name} is restarting`)
    } catch (failure) {
      setError(errorMessage(failure))
      setWorking(false)
    }
  }

  return (
    <>
      <DialogHeader className="gap-1 px-6 pt-4 pr-12">
        <DialogTitle className="text-base">
          {installing
            ? `Install offsite on ${props.name}`
            : `Update ${props.name} to offsite ${props.update}`}
        </DialogTitle>
        <DialogDescription>
          {installing
            ? 'offsite will start at login, start again if it stops, and update itself.'
            : 'offsite installs the update, then restarts.'}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 p-6 text-sm">
        {installing && (
          <label className="flex flex-col gap-2">
            <span className="font-medium">
              Package manager you installed offsite with
            </span>
            <Select
              value={manager ?? undefined}
              onValueChange={(value: PackageManager) => setManager(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {packageManagers.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        )}
        {busy === null && error === null && (
          <p className="text-muted-foreground">Checking what’s running…</p>
        )}
        {busy !== null && busy.length === 0 && (
          <p className="text-muted-foreground">
            Nothing is running, so nothing stops when offsite restarts.
          </p>
        )}
        {busy !== null && busy.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-destructive font-medium">
              Restarting offsite now stops:
            </p>
            <ul className="text-muted-foreground list-disc pl-5">
              {busy.map((reason, index) => (
                <li key={`${index} ${reason}`}>{reason}</li>
              ))}
            </ul>
          </div>
        )}
        {working && !installing && (
          <p className="text-muted-foreground">
            Installing the update; this can take a minute…
          </p>
        )}
        {error !== null && <p className="text-destructive">{error}</p>}
      </div>
      <DialogFooter className="bg-muted/40 border-t px-6 py-4">
        <Button type="button" variant="outline" onClick={props.onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={busy !== null && busy.length > 0 ? 'destructive' : 'default'}
          disabled={
            working || busy === null || (installing && manager === null)
          }
          onClick={() => void confirm()}
        >
          {installing
            ? working
              ? 'Installing…'
              : 'Install and restart'
            : working
              ? 'Updating…'
              : 'Update and restart'}
        </Button>
      </DialogFooter>
    </>
  )
}
