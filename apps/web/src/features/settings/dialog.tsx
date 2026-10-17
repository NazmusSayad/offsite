import { ArrowRight01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { updateConfig } from '@/api/machine-config'
import { machineIcons, ProviderIcon } from '@/components/icons'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { defaultPrefs } from '@/lib/prefs'
import {
  machineOf,
  type SettingsPage,
  showSettings,
  showSettingsPage,
  update,
  updatePrefs,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'
import { GeneralPage } from './general'
import { MachinePage } from './machine'
import { MachinesPage } from './machines'
import { NotificationsPage } from './notifications'
import { ProviderPage } from './provider'
import { ShortcutsPage } from './shortcuts'
import { TerminalPage } from './terminal'

const browserPages: SettingsPage[] = [
  'General',
  'Terminal',
  'Notifications',
  'Shortcuts',
  'Machines',
]
const machinePages: SettingsPage[] = ['Machine', 'Claude', 'Codex', 'OpenCode']

export function SettingsDialog() {
  const open = useStore((state) => state.settingsOpen)
  const prefs = useStore((state) => state.prefs)
  const machines = useStore((state) => state.machines)
  const machine = useStore((state) =>
    state.settingsMachine === null
      ? null
      : machineOf(state, state.settingsMachine)
  )
  const config = machine === null ? null : machine.config
  const system = machine === null ? null : machine.system
  const page = useStore((state) => state.settingsPage)
  const machinePage = machinePages.includes(page)
  const pageProvider = providerOf(page)
  const settingsAccount = useStore((state) =>
    pageProvider === null ? null : state.settingsAccount
  )
  const accountTitle =
    settingsAccount === 'new'
      ? 'New account'
      : machine?.accounts.find((account) => account.id === settingsAccount)
          ?.name
  const [confirming, setConfirming] = useState<'browser' | 'machine' | null>(
    null
  )
  const [revision, setRevision] = useState(0)

  function navButton(item: SettingsPage) {
    const provider = providerOf(item)
    return (
      <button
        key={item}
        className={cn(
          'text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 flex-none items-center rounded-md px-2 text-sm transition-colors',
          item === page && 'bg-accent text-foreground'
        )}
        onClick={() => showSettingsPage(item)}
      >
        {provider !== null && (
          <span className="mr-2.5 flex size-4 items-center justify-center">
            <ProviderIcon
              provider={provider}
              className={cn(
                provider === 'claude' && 'size-4',
                provider === 'codex' && 'size-[19px] shrink-0',
                provider === 'opencode' && 'h-3.5'
              )}
            />
          </span>
        )}
        {item === 'Machine' ? 'General' : item}
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={showSettings}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex h-[min(44rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl sm:flex-row"
      >
        <nav className="flex flex-none gap-1 overflow-x-auto border-b p-3 sm:w-48 sm:flex-col sm:border-r sm:border-b-0">
          <DialogTitle className="hidden px-2 pt-1 pb-3 text-base font-semibold sm:block">
            Settings
          </DialogTitle>
          {browserPages.map(navButton)}
          <div className="flex flex-none items-center gap-1 sm:mt-6 sm:flex-col sm:items-stretch">
            {machine !== null && machines.length > 1 && (
              <Select
                value={machine.id}
                onValueChange={(settingsMachine) =>
                  update({ settingsMachine, settingsAccount: null })
                }
              >
                <SelectTrigger className="mb-1 w-40 sm:w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {machines.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <HugeiconsIcon icon={machineIcons[item.icon]} />
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {machine !== null && machines.length === 1 && (
              <p className="text-muted-foreground flex h-9 items-center gap-1.5 px-2 text-xs font-medium [&_svg]:size-4">
                <HugeiconsIcon icon={machineIcons[machine.icon]} />
                <span className="truncate">{machine.name}</span>
              </p>
            )}
            {machinePages.map(navButton)}
          </div>
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-7">
          <div className="mb-5 flex h-9 items-center">
            {settingsAccount !== null && (
              <>
                <button
                  className="text-muted-foreground hover:text-foreground text-xl font-semibold tracking-tight transition-colors"
                  onClick={() => update({ settingsAccount: null })}
                >
                  {page}
                </button>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="text-muted-foreground mx-1.5 size-5"
                />
                <h2 className="truncate text-xl font-semibold tracking-tight">
                  {accountTitle}
                </h2>
              </>
            )}
            {settingsAccount === null && (
              <h2 className="text-xl font-semibold tracking-tight">
                {page === 'Machine' ? 'General' : page}
              </h2>
            )}
            {pageProvider !== null &&
              settingsAccount === null &&
              machine !== null &&
              config !== null && (
                <Switch
                  className="ml-3"
                  checked={config.enabledProviders[pageProvider]}
                  onCheckedChange={(checked) =>
                    void updateConfig(machine.id, {
                      ...config,
                      enabledProviders: {
                        ...config.enabledProviders,
                        [pageProvider]: checked,
                      },
                    })
                  }
                  aria-label={`Enable ${page}`}
                />
              )}
            <DialogClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 ml-auto"
                aria-label="Close settings"
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </Button>
            </DialogClose>
          </div>
          {machinePage && machine !== null && machine.configError !== null && (
            <p className="text-destructive mb-5 text-sm whitespace-pre-wrap">
              Not saved: {machine.configError}
            </p>
          )}
          <div key={revision} className="w-full space-y-5">
            {page === 'General' && (
              <GeneralPage
                prefs={prefs}
                onRestore={() => setConfirming('browser')}
              />
            )}
            {page === 'Machine' &&
              machine !== null &&
              config !== null &&
              system !== null && (
                <MachinePage
                  machine={machine.id}
                  config={config}
                  platform={system.platform}
                  defaultShell={system.defaultShell}
                  accounts={machine.accounts}
                  onRestore={() => setConfirming('machine')}
                />
              )}
            {machinePage && machine === null && (
              <p className="text-muted-foreground text-sm">
                Add a machine to see its settings.
              </p>
            )}
            {machinePage &&
              machine !== null &&
              (config === null || system === null) && (
                <p className="text-muted-foreground text-sm">
                  {machine.name} is not connected. Its settings show up once it
                  is.
                </p>
              )}
            {page === 'Terminal' && <TerminalPage prefs={prefs} />}
            {page === 'Notifications' && <NotificationsPage prefs={prefs} />}
            {pageProvider !== null && machine !== null && config !== null && (
              <ProviderPage
                key={pageProvider}
                machine={machine.id}
                config={config}
                provider={pageProvider}
                accounts={machine.accounts}
                selected={settingsAccount}
              />
            )}
            {page === 'Machines' && <MachinesPage />}
            {page === 'Shortcuts' && <ShortcutsPage />}
          </div>
        </div>
        <AlertDialog
          open={confirming !== null}
          onOpenChange={(open) => {
            if (!open) setConfirming(null)
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirming === 'browser'
                  ? 'Restore browser defaults?'
                  : 'Restore machine defaults?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirming === 'browser'
                  ? 'All settings of this browser go back to their defaults.'
                  : `All settings of ${machine?.name} go back to their defaults.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setRevision(revision + 1)
                  if (confirming === 'browser') {
                    updatePrefs(defaultPrefs)
                    return
                  }
                  if (machine === null || system === null)
                    throw new Error(
                      'Restoring machine defaults needs a connected machine'
                    )
                  updateConfig(machine.id, system.defaults)
                }}
              >
                Restore defaults
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

function providerOf(page: SettingsPage) {
  if (page === 'Claude') return 'claude'
  if (page === 'Codex') return 'codex'
  if (page === 'OpenCode') return 'opencode'
  return null
}
