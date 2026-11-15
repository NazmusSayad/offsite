import {
  Add01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MachineLogo } from '@/constants/machine-icons'
import { AddMachineDialog } from '@/features/sidebar/machine-dialog'
import {
  type SettingsPage,
  showMachineSettings,
  showSettings,
  showSettingsPage,
  update,
  useStore,
} from '@/lib/store'
import { useCloseOnBack } from '@/lib/url'
import { cn } from '@/lib/utils'
import { MachineStatusDot, machineStatuses } from './connection'
import { Section } from './controls'
import {
  browserPages,
  machinePages,
  PageLabel,
  ProviderSwitch,
  SettingsContent,
  useSettingsView,
} from './dialog'

export function MobileSettings() {
  const open = useStore((state) => state.settingsOpen)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={showSettings}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="bg-background text-foreground data-open:animate-in data-open:slide-in-from-right fixed inset-0 z-50 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-sm duration-200 outline-none motion-reduce:animate-none"
        >
          <MobileSettingsPanel />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

function MobileSettingsPanel() {
  const listing = useStore((state) => state.settingsListing)
  const view = useSettingsView()
  const machine = view.machine
  const [adding, setAdding] = useState(false)
  useCloseOnBack(true, back)

  function back() {
    if (listing === 'settings') {
      showSettings(false)
      return
    }
    if (listing === 'machine') {
      update({ settingsListing: 'settings' })
      return
    }
    if (view.subpage) {
      update({ settingsAccount: null })
      return
    }
    if (view.inside && !view.flat) {
      update({ settingsListing: 'machine' })
      return
    }
    update({ settingsListing: 'settings' })
  }

  function pageRow(page: SettingsPage) {
    return (
      <button
        key={page}
        className="active:bg-accent flex min-h-12 w-full items-center px-4 text-left text-sm font-medium"
        onClick={() => showSettingsPage(page)}
      >
        <PageLabel page={page} />
        {page === 'Connection' && machine !== null && (
          <span className="text-muted-foreground ml-auto flex items-center gap-1.5 text-xs font-normal">
            <MachineStatusDot status={machine.status} />
            {machineStatuses[machine.status]}
          </span>
        )}
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className={cn(
            'text-muted-foreground size-4',
            page === 'Connection' && machine !== null ? 'ml-2' : 'ml-auto'
          )}
        />
      </button>
    )
  }

  return (
    <>
      <header className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-1.5 px-2">
        <Button variant="ghost" size="icon" aria-label="Back" onClick={back}>
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            className="text-foreground size-5"
            strokeWidth={2}
          />
        </Button>
        <DialogPrimitive.Title className="flex min-w-0 flex-1 items-center gap-2 font-medium">
          {listing === 'settings' && 'Settings'}
          {listing === 'machine' && machine === null && 'Settings'}
          {listing === 'machine' && machine !== null && (
            <>
              <MachineLogo
                icon={machine.icon}
                className="text-muted-foreground size-4.5 shrink-0"
              />
              <span className="truncate">{machine.name}</span>
            </>
          )}
          {listing === null && view.subpage && (
            <span className="truncate">{view.subpageTitle}</span>
          )}
          {listing === null && !view.subpage && (
            <span className="truncate">
              {view.page === 'Machine' ? 'General' : view.page}
            </span>
          )}
        </DialogPrimitive.Title>
        {listing === null && (
          <ProviderSwitch view={view} className="shrink-0" />
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
        {listing === 'settings' && (
          <div className="space-y-5">
            <Section title="This browser">{browserPages.map(pageRow)}</Section>
            <section>
              <div className="mb-1 flex items-center justify-between px-1">
                <h2 className="text-muted-foreground text-xs font-medium">
                  {view.flat ? 'Server' : 'Servers'}
                </h2>
                <Button
                  variant="ghost-muted"
                  size="xs"
                  onClick={() => setAdding(true)}
                >
                  <HugeiconsIcon icon={Add01Icon} />
                  Add machine
                </Button>
              </div>
              {view.machines.length > 0 && (
                <div className="divide-y overflow-hidden rounded-xl border">
                  {view.flat && machinePages.map(pageRow)}
                  {!view.flat &&
                    view.machines.map((item) => (
                      <button
                        key={item.id}
                        className="active:bg-accent flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm font-medium"
                        onClick={() => showMachineSettings(item.id)}
                      >
                        <MachineLogo
                          icon={item.icon}
                          className="text-muted-foreground size-4.5 shrink-0"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {item.name}
                        </span>
                        <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs font-normal">
                          <MachineStatusDot status={item.status} />
                          {machineStatuses[item.status]}
                        </span>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          className="text-muted-foreground size-4 shrink-0"
                        />
                      </button>
                    ))}
                </div>
              )}
            </section>
            {adding && <AddMachineDialog onClose={() => setAdding(false)} />}
          </div>
        )}
        {listing === 'machine' && machine === null && (
          <p className="text-muted-foreground text-sm">
            Add a machine to see its settings.
          </p>
        )}
        {listing === 'machine' && machine !== null && (
          <Section title="Machine">{machinePages.map(pageRow)}</Section>
        )}
        {listing === null && <SettingsContent view={view} />}
      </div>
    </>
  )
}
