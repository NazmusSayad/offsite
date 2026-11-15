import {
  Alert02Icon,
  ArrowDown01Icon,
  BrowserIcon,
  CircleDotDashedIcon,
  ReloadIcon,
  ServerIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ReactNode, useState } from 'react'
import { ServiceTray } from '@/features/sidebar/service-tray'
import { applyBrowserUpdate } from '@/lib/browser-update'
import { type Machine, showError, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

function Group(props: {
  icon: typeof ServerIcon
  tone: string
  label: string
  count: number
  busy: boolean
  open: boolean | null
  onClick: () => void
  children?: ReactNode
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-r-md border-l-2 bg-linear-to-r to-transparent transition-colors',
        props.tone,
        props.open && 'bg-sidebar-accent/50'
      )}
    >
      <button
        type="button"
        aria-expanded={props.open ?? undefined}
        disabled={props.open === null && props.busy}
        className="group flex h-8 w-full items-center gap-2 pr-1.5 pl-2.5 text-left transition-colors hover:bg-white/4 disabled:cursor-default"
        onClick={props.onClick}
      >
        <HugeiconsIcon
          icon={props.busy ? CircleDotDashedIcon : props.icon}
          className={cn('size-4 shrink-0', props.busy && 'animate-spin')}
        />
        <span className="text-sidebar-foreground min-w-0 flex-1 truncate text-[0.8125rem] font-medium">
          {props.label}
        </span>
        {props.count > 1 && (
          <span className="text-sidebar-foreground bg-sidebar-foreground/10 rounded-full px-1.5 text-[0.6875rem] font-medium tabular-nums">
            {props.count}
          </span>
        )}
        {props.open !== null && (
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              'text-muted-foreground group-hover:text-sidebar-foreground size-3.5 shrink-0 transition-transform duration-200',
              props.open && 'rotate-180'
            )}
          />
        )}
      </button>
      {props.open && props.children}
    </div>
  )
}

export function ServiceBanners() {
  const browserUpdate = useStore((state) => state.browserUpdate)
  const machines = useStore((state) => state.machines)
  const [updating, setUpdating] = useState(false)
  const [open, setOpen] = useState<'update' | 'restart' | 'install' | null>(
    null
  )
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

  function toggle(kind: 'update' | 'restart' | 'install') {
    setOpen(open === kind ? null : kind)
  }

  return (
    <div className="flex max-h-[70dvh] shrink-0 flex-col gap-1 overflow-y-auto px-(--sidebar-content-inset) pb-(--sidebar-content-inset)">
      {browserUpdate && (
        <Group
          icon={BrowserIcon}
          tone="border-success from-success/18 text-success"
          label={updating ? 'Updating browser…' : 'Browser update available'}
          count={1}
          busy={updating}
          open={null}
          onClick={async () => {
            setUpdating(true)
            try {
              await applyBrowserUpdate()
            } catch (error) {
              showError(error)
              setUpdating(false)
            }
          }}
        />
      )}
      {updates.length > 0 && (
        <Group
          icon={ServerIcon}
          tone="border-success from-success/18 text-success"
          label={
            updates.length === 1 ? 'Server update available' : 'Server updates'
          }
          count={updates.length}
          busy={updates.some(
            (machine) => machine.service?.update?.status === 'downloading'
          )}
          open={open === 'update'}
          onClick={() => toggle('update')}
        >
          <ServiceTray kind="update" machines={updates} />
        </Group>
      )}
      {restarts.length > 0 && (
        <Group
          icon={ReloadIcon}
          tone="border-info from-info/18 text-info"
          label={
            restarts.length === 1
              ? 'Server restart required'
              : 'Server restarts'
          }
          count={restarts.length}
          busy={false}
          open={open === 'restart'}
          onClick={() => toggle('restart')}
        >
          <ServiceTray kind="restart" machines={restarts} />
        </Group>
      )}
      {uninstalled.length > 0 && (
        <Group
          icon={Alert02Icon}
          tone="border-warning from-warning/18 text-warning"
          label={
            uninstalled.length === 1
              ? 'Service not installed'
              : 'Services not installed'
          }
          count={uninstalled.length}
          busy={false}
          open={open === 'install'}
          onClick={() => toggle('install')}
        >
          <ServiceTray kind="install" machines={uninstalled} />
        </Group>
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
