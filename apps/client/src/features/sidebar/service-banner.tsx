import {
  CircleArrowUp01Icon,
  PowerServiceIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ServiceDialog } from '@/features/service/service-dialog'
import { useStore } from '@/lib/store'

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
    <div className="flex shrink-0 flex-col gap-px px-(--sidebar-content-inset) pb-(--sidebar-content-inset)">
      {shown.map((machine) => (
        <ServiceBanner
          key={machine.id}
          machine={machine.id}
          name={machine.name}
          update={machine.service?.installed ? machine.service.update : null}
        />
      ))}
    </div>
  )
}

function ServiceBanner(props: {
  machine: string
  name: string
  update: string | null
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 flex h-9 items-center gap-2 rounded-lg border px-(--sidebar-row-content-inset) text-sm font-medium transition-colors"
        onClick={() => setOpen(true)}
      >
        <HugeiconsIcon
          icon={props.update === null ? PowerServiceIcon : CircleArrowUp01Icon}
          className="size-4 shrink-0"
        />
        <span className="min-w-0 flex-1 truncate text-left">
          {props.update === null
            ? `Start ${props.name} at login`
            : `Update ${props.name}`}
        </span>
        {props.update !== null && (
          <span className="shrink-0 text-xs opacity-75">{props.update}</span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          aria-describedby={undefined}
          className="gap-0 overflow-hidden p-0 sm:max-w-md"
        >
          <ServiceDialog
            machine={props.machine}
            update={props.update !== null}
            onClose={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
