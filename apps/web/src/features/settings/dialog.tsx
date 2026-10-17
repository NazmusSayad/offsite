import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { schemes } from '@offsite/core/schemes'
import { useState } from 'react'
import { updateConfig } from '@/api/machine-config'
import { machineIcons } from '@/components/icons'
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
import { cn, isMac, mod } from '@/lib/utils'
import { AccountsPage } from './accounts'
import { Row, Section } from './controls'
import { MachinesPage } from './machines'
import { BellSection, NotificationSection, UpdateSection } from './sections'
import { TerminalLookPage, TerminalMachinePage } from './terminal'

const terminalMod = isMac ? '⌘' : 'Ctrl+Shift'

const pages: SettingsPage[] = [
  'General',
  'Terminal',
  'Notifications',
  'Accounts',
  'Machines',
  'Shortcuts',
]

const shortcuts = [
  ['Enter', 'Send, or queue while the agent works'],
  [`${mod}+Enter`, 'Send now, steering the current turn'],
  ['Shift+Enter', 'New line'],
  ['↑', 'Recall your last message'],
  ['Shift+Tab', 'Cycle permission mode'],
  ['Esc', 'Stop the agent'],
  ['/', 'Slash commands'],
  ['@', 'Mention a file'],
  [`${mod}+K`, 'Search sessions and actions'],
  [`${mod}+N or ${mod}+T`, 'New thread'],
  [isMac ? '⌘+`, Ctrl+` or ⌘+J' : 'Ctrl+` or Ctrl+J', 'Toggle the terminal'],
  [`${mod}+B`, 'Toggle the sidebar'],
  [`${terminalMod}+T`, 'New terminal tab, in the terminal'],
  [`${terminalMod}+W`, 'Close the terminal tab'],
  [`${terminalMod}+F`, 'Find in the terminal'],
  ['Ctrl+Tab', 'Next terminal tab'],
  ['Ctrl+Shift+Tab', 'Previous terminal tab'],
]

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
  const machinePage = page === 'Terminal' || page === 'Accounts'
  const [confirming, setConfirming] = useState(false)
  const [revision, setRevision] = useState(0)

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
          {pages.map((item) => (
            <button
              key={item}
              className={cn(
                'text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 flex-none items-center rounded-md px-2 text-sm transition-colors',
                item === page && 'bg-accent text-foreground'
              )}
              onClick={() => showSettingsPage(item)}
            >
              {item}
            </button>
          ))}
          <div className="flex flex-none items-center gap-1 sm:mt-auto sm:flex-col sm:items-stretch">
            <p className="text-muted-foreground hidden px-2 text-xs sm:block">
              ~/.offsite/config.json
            </p>
            <Button
              variant="ghost-muted"
              size="sm"
              className="justify-start"
              onClick={() => setConfirming(true)}
            >
              Restore defaults
            </Button>
          </div>
        </nav>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-7">
          <div className="mb-5 flex h-9 items-center">
            <h2 className="text-xl font-semibold tracking-tight">{page}</h2>
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
          {machinePage && machine !== null && machines.length > 1 && (
            <div className="mb-5">
              <Section title="Machine">
                <Row label="Settings of">
                  <Select
                    value={machine.id}
                    onValueChange={(settingsMachine) =>
                      update({ settingsMachine })
                    }
                  >
                    <SelectTrigger className="w-56">
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
                </Row>
              </Section>
            </div>
          )}
          {machinePage && machine !== null && machine.configError !== null && (
            <p className="text-destructive mb-5 text-sm whitespace-pre-wrap">
              Not saved: {machine.configError}
            </p>
          )}
          <div key={revision} className="w-full space-y-5">
            {page === 'General' && (
              <Section title="Appearance">
                <Row label="Theme">
                  <Select
                    value={prefs.theme}
                    onValueChange={(theme) => updatePrefs({ ...prefs, theme })}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {schemes.map((scheme) => (
                        <SelectItem key={scheme.id} value={scheme.id}>
                          {scheme.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Row>
              </Section>
            )}
            {page === 'General' && <UpdateSection />}
            {page === 'Terminal' &&
              machine !== null &&
              config !== null &&
              system !== null && (
                <TerminalMachinePage
                  key={machine.id}
                  machine={machine.id}
                  config={config}
                  platform={system.platform}
                  defaultShell={system.defaultShell}
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
            {page === 'Terminal' && <TerminalLookPage prefs={prefs} />}
            {page === 'Notifications' && (
              <>
                <NotificationSection />
                <BellSection
                  behavior={prefs.terminal.behavior}
                  onChange={(value) =>
                    updatePrefs({
                      ...prefs,
                      terminal: {
                        ...prefs.terminal,
                        behavior: { ...prefs.terminal.behavior, ...value },
                      },
                    })
                  }
                />
              </>
            )}
            {page === 'Accounts' && machine !== null && config !== null && (
              <AccountsPage
                machine={machine.id}
                config={config}
                accounts={machine.accounts}
              />
            )}
            {page === 'Machines' && <MachinesPage />}
            {page === 'Shortcuts' && (
              <Section title="Keyboard shortcuts">
                {shortcuts.map(([keys, action]) => (
                  <Row key={keys} label={action}>
                    <kbd className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 font-sans text-xs">
                      {keys}
                    </kbd>
                  </Row>
                ))}
              </Section>
            )}
          </div>
        </div>
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore defaults?</AlertDialogTitle>
              <AlertDialogDescription>
                The theme and terminal look of this browser go back to their
                defaults
                {machine === null
                  ? '.'
                  : `, and so do the settings of ${machine.name}, including the defaults for new threads and the terminal shell for all platforms.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setRevision(revision + 1)
                  updatePrefs(defaultPrefs)
                  if (machine !== null && system !== null)
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
