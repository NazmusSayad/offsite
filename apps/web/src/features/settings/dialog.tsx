import { ArrowRight01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Provider } from '@offsite/core/providers'
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

export const browserPages: SettingsPage[] = [
  'General',
  'Terminal',
  'Notifications',
  'Shortcuts',
  'Machines',
]
export const machinePages: SettingsPage[] = [
  'Machine',
  'Claude',
  'Codex',
  'OpenCode',
]

export function useSettingsView() {
  const machines = useStore((state) => state.machines)
  const machine = useStore((state) =>
    state.settingsMachine === null
      ? null
      : machineOf(state, state.settingsMachine)
  )
  const page = useStore((state) => state.settingsPage)
  const provider = providerOf(page)
  const account = useStore((state) =>
    provider === null ? null : state.settingsAccount
  )
  const editedMachine = useStore((state) =>
    page === 'Machines'
      ? (state.machines.find(
          (item) => item.id === state.settingsEditedMachine
        ) ?? null)
      : null
  )

  return {
    machines,
    machine,
    config: machine === null ? null : machine.config,
    system: machine === null ? null : machine.system,
    page,
    provider,
    account,
    editedMachine,
    subpage: account !== null || editedMachine !== null,
    subpageTitle:
      account === 'new'
        ? 'New account'
        : account !== null
          ? [
              ...(machine?.claudeAccounts ?? []),
              ...(machine?.codexAccounts ?? []),
            ].find((item) => item.id === account)?.name
          : editedMachine?.name,
  }
}

type SettingsView = ReturnType<typeof useSettingsView>

export function SettingsDialog() {
  const open = useStore((state) => state.settingsOpen)
  const view = useSettingsView()
  const page = view.page
  const machine = view.machine

  function navButton(item: SettingsPage) {
    return (
      <button
        key={item}
        className={cn(
          'text-muted-foreground hover:bg-accent hover:text-foreground flex h-9 flex-none items-center rounded-md px-2 text-sm transition-colors',
          item === page && 'bg-accent text-foreground'
        )}
        onClick={() => showSettingsPage(item)}
      >
        <PageLabel page={item} />
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
            {machine !== null && view.machines.length > 1 && (
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
                  {view.machines.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      <HugeiconsIcon icon={machineIcons[item.icon]} />
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {machine !== null && view.machines.length === 1 && (
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
            {view.subpage && (
              <>
                <button
                  className="text-muted-foreground hover:text-foreground text-xl font-semibold tracking-tight transition-colors"
                  onClick={() =>
                    update({
                      settingsAccount: null,
                      settingsEditedMachine: null,
                    })
                  }
                >
                  {page}
                </button>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="text-muted-foreground mx-1.5 size-5"
                />
                <h2 className="truncate text-xl font-semibold tracking-tight">
                  {view.subpageTitle}
                </h2>
              </>
            )}
            {!view.subpage && (
              <h2 className="text-xl font-semibold tracking-tight">
                {page === 'Machine' ? 'General' : page}
              </h2>
            )}
            <ProviderSwitch view={view} className="ml-3" />
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
          <SettingsContent view={view} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function PageLabel(props: { page: SettingsPage }) {
  const provider = providerOf(props.page)

  return (
    <>
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
      {props.page === 'Machine' ? 'General' : props.page}
    </>
  )
}

export function ProviderSwitch(props: {
  view: SettingsView
  className: string
}) {
  const machine = props.view.machine
  const config = props.view.config
  const provider = props.view.provider
  if (
    provider === null ||
    props.view.account !== null ||
    machine === null ||
    config === null
  ) {
    return null
  }

  return (
    <Switch
      className={props.className}
      checked={config.enabledProviders[provider]}
      onCheckedChange={(checked) =>
        void updateConfig(machine.id, {
          ...config,
          enabledProviders: { ...config.enabledProviders, [provider]: checked },
        })
      }
      aria-label={`Enable ${props.view.page}`}
    />
  )
}

export function SettingsContent(props: { view: SettingsView }) {
  const prefs = useStore((state) => state.prefs)
  const page = props.view.page
  const machine = props.view.machine
  const config = props.view.config
  const system = props.view.system
  const machinePage = machinePages.includes(page)
  const [confirming, setConfirming] = useState<'browser' | 'machine' | null>(
    null
  )
  const [revision, setRevision] = useState(0)

  return (
    <>
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
              claudeAccounts={machine.claudeAccounts}
              codexAccounts={machine.codexAccounts}
              openCode={machine.openCode}
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
              {machine.name} is not connected. Its settings show up once it is.
            </p>
          )}
        {page === 'Terminal' && <TerminalPage prefs={prefs} />}
        {page === 'Notifications' && <NotificationsPage prefs={prefs} />}
        {props.view.provider !== null &&
          machine !== null &&
          config !== null &&
          machine.composer !== null &&
          system !== null && (
            <ProviderPage
              key={props.view.provider}
              machine={machine.id}
              config={config}
              composer={machine.composer}
              platform={system.platform}
              defaultClaudeBaseDir={system.defaultClaudeBaseDir}
              provider={props.view.provider}
              claudeAccounts={machine.claudeAccounts}
              codexAccounts={machine.codexAccounts}
              openCode={machine.openCode}
              selected={props.view.account}
            />
          )}
        {page === 'Machines' && <MachinesPage />}
        {page === 'Shortcuts' && <ShortcutsPage />}
      </div>
      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(null)
          }
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
                if (machine === null || config === null || system === null) {
                  throw new Error(
                    'Restoring machine defaults needs a connected machine'
                  )
                }
                updateConfig(machine.id, {
                  ...system.defaults,
                  claudeAccounts: config.claudeAccounts,
                  codexAccounts: config.codexAccounts,
                })
              }}
            >
              Restore defaults
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function providerOf(page: SettingsPage): Provider | null {
  if (page === 'Claude') {
    return 'claude'
  }
  if (page === 'Codex') {
    return 'codex'
  }
  if (page === 'OpenCode') {
    return 'opencode'
  }
  return null
}
