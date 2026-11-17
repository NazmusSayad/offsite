import { Alert02Icon, ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { ServiceTray } from '@/features/sidebar/service-tray'
import { UpdatePanel } from '@/features/sidebar/update-panel'
import { type Machine, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function ServiceBanners() {
  const browserUpdate = useStore((state) => state.browserUpdate)
  const machines = useStore((state) => state.machines)
  const [open, setOpen] = useState(false)
  const updates = machines.filter(
    (machine) => serviceKind(machine) === 'update'
  )
  const restarts = machines.filter(
    (machine) => serviceKind(machine) === 'restart'
  )
  const uninstalled = machines.filter(
    (machine) => serviceKind(machine) === 'install'
  )
  if (
    !browserUpdate &&
    updates.length === 0 &&
    restarts.length === 0 &&
    uninstalled.length === 0
  ) {
    return null
  }

  return (
    <div className="flex max-h-[70dvh] shrink-0 flex-col gap-1 overflow-y-auto px-(--sidebar-content-inset) pb-(--sidebar-content-inset)">
      {(browserUpdate || updates.length > 0) && (
        <UpdatePanel kind="update" browser={browserUpdate} machines={updates} />
      )}
      {restarts.length > 0 && (
        <UpdatePanel kind="restart" browser={false} machines={restarts} />
      )}
      {uninstalled.length > 0 && (
        <div
          className={cn(
            'border-warning from-warning/18 text-warning overflow-hidden rounded-r-md border-l-2 bg-linear-to-r to-transparent transition-colors',
            open && 'bg-sidebar-accent/50'
          )}
        >
          <button
            type="button"
            aria-expanded={open}
            className="group flex h-8 w-full items-center gap-2 pr-1.5 pl-2.5 text-left transition-colors hover:bg-white/4"
            onClick={() => setOpen(!open)}
          >
            <HugeiconsIcon icon={Alert02Icon} className="size-4 shrink-0" />
            <span className="text-sidebar-foreground min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
              {uninstalled.length === 1
                ? 'Service not installed'
                : 'Services not installed'}
            </span>
            {uninstalled.length > 1 && (
              <span className="text-sidebar-foreground bg-sidebar-foreground/10 rounded-full px-1.5 text-[0.6875rem] font-medium tabular-nums">
                {uninstalled.length}
              </span>
            )}
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className={cn(
                'text-muted-foreground group-hover:text-sidebar-foreground size-3.5 shrink-0 transition-transform duration-200',
                open && 'rotate-180'
              )}
            />
          </button>
          {open && <ServiceTray machines={uninstalled} />}
        </div>
      )}
    </div>
  )
}

function serviceKind(machine: Machine) {
  if (machine.status !== 'online' || machine.service === null) {
    return null
  }
  if (!machine.service.installed) {
    return 'install'
  }
  if (machine.service.update === null) {
    return null
  }
  if (machine.service.update.status === 'ready') {
    return 'restart'
  }
  return 'update'
}
