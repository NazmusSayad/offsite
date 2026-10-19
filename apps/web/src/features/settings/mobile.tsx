import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { machineIcons } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  type SettingsPage,
  showSettings,
  showSettingsPage,
  update,
  useStore,
} from '@/lib/store'
import { Row, Section } from './controls'
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
  const listing = useStore((state) => state.settingsListing)
  const view = useSettingsView()
  const machine = view.machine

  function back() {
    if (listing) {
      showSettings(false)
      return
    }
    if (view.subpage) {
      update({ settingsAccount: null, settingsEditedMachine: null })
      return
    }
    update({ settingsListing: true })
  }

  function pageRow(page: SettingsPage) {
    return (
      <button
        key={page}
        className="active:bg-accent flex min-h-12 w-full items-center px-4 text-left text-sm font-medium"
        onClick={() => showSettingsPage(page)}
      >
        <PageLabel page={page} />
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className="text-muted-foreground ml-auto size-4"
        />
      </button>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={showSettings}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="bg-background text-foreground data-open:animate-in data-open:slide-in-from-right fixed inset-0 z-50 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-sm duration-200 outline-none [--workspace-topbar-height:44px] motion-reduce:animate-none"
        >
          <header className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-1.5 pr-3 pl-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Back"
              onClick={back}
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                className="text-foreground size-5"
                strokeWidth={2}
              />
            </Button>
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate font-medium">
              {listing && 'Settings'}
              {!listing && view.subpage && view.subpageTitle}
              {!listing && !view.subpage && view.page}
            </DialogPrimitive.Title>
            {!listing && <ProviderSwitch view={view} className="shrink-0" />}
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6">
            {listing && (
              <div className="space-y-5">
                <Section title="This browser">
                  {browserPages.map(pageRow)}
                </Section>
                <Section title="Machine">
                  {machine !== null && (
                    <Row label="Machine">
                      {view.machines.length > 1 && (
                        <Select
                          value={machine.id}
                          onValueChange={(settingsMachine) =>
                            update({ settingsMachine, settingsAccount: null })
                          }
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {view.machines.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                <HugeiconsIcon icon={machineIcons[item.icon]} />
                                {item.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {view.machines.length === 1 && (
                        <span className="text-muted-foreground flex items-center gap-1.5 text-sm [&_svg]:size-4">
                          <HugeiconsIcon icon={machineIcons[machine.icon]} />
                          {machine.name}
                        </span>
                      )}
                    </Row>
                  )}
                  {machinePages.map(pageRow)}
                </Section>
              </div>
            )}
            {!listing && <SettingsContent view={view} />}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
