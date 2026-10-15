import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { schemes } from '@server/schemes'
import { useState } from 'react'
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
import { cn, isMac, mod } from '@/lib/utils'
import { showAccounts, showSettings, updateConfig, useStore } from '@/store'
import { Row, Section } from './controls'
import { BellSection, NotificationSection } from './sections'
import { TerminalPage } from './terminal'

const terminalMod = isMac ? '⌘' : 'Ctrl+Shift'

const pages = [
  'General',
  'Terminal',
  'Notifications',
  'Accounts',
  'Shortcuts',
] as const

const shortcuts = [
  ['Enter', 'Send, or queue while Claude works'],
  [`${mod}+Enter`, 'Send now, steering the current turn'],
  ['Shift+Enter', 'New line'],
  ['↑', 'Recall your last message'],
  ['Shift+Tab', 'Cycle permission mode'],
  ['Esc', 'Stop Claude'],
  ['/', 'Slash commands'],
  ['@', 'Mention a file'],
  [`${mod}+K`, 'Search sessions and actions'],
  [`${mod}+J`, 'Toggle the terminal'],
  [`${mod}+B`, 'Toggle the sidebar'],
  [`${terminalMod}+T`, 'New terminal tab'],
  [`${terminalMod}+W`, 'Close the terminal tab'],
  [`${terminalMod}+F`, 'Find in the terminal'],
  ['Ctrl+Tab', 'Next terminal tab'],
  ['Ctrl+Shift+Tab', 'Previous terminal tab'],
]

export function SettingsDialog() {
  const open = useStore((state) => state.settingsOpen)
  const config = useStore((state) => state.config)
  const configError = useStore((state) => state.configError)
  const system = useStore((state) => state.system)
  const accounts = useStore((state) => state.accounts)
  const [page, setPage] = useState<(typeof pages)[number]>('General')
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
              onClick={() => setPage(item)}
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
          {configError !== null && (
            <p className="text-destructive mb-5 text-sm whitespace-pre-wrap">
              Not saved: {configError}
            </p>
          )}
          <div key={revision} className="w-full space-y-5">
            {page === 'General' && (
              <Section title="Appearance">
                <Row label="Theme">
                  <Select
                    value={config.theme}
                    onValueChange={(theme) =>
                      updateConfig({ ...config, theme })
                    }
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
            {page === 'Terminal' && (
              <TerminalPage
                config={config}
                platform={system.platform}
                defaultShell={system.defaultShell}
              />
            )}
            {page === 'Notifications' && (
              <>
                <NotificationSection />
                <BellSection
                  behavior={config.terminal.behavior}
                  onChange={(value) =>
                    updateConfig({
                      ...config,
                      terminal: {
                        ...config.terminal,
                        behavior: { ...config.terminal.behavior, ...value },
                      },
                    })
                  }
                />
              </>
            )}
            {page === 'Accounts' && (
              <Section title="Claude accounts">
                <Row
                  label={
                    accounts.length === 1
                      ? '1 account'
                      : `${accounts.length} accounts`
                  }
                >
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      showSettings(false)
                      showAccounts(true)
                    }}
                  >
                    Manage
                  </Button>
                </Row>
              </Section>
            )}
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
                Every setting, including the theme, the defaults for new threads
                and the terminal shell for all platforms, goes back to its
                default.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setRevision(revision + 1)
                  updateConfig(system.defaults)
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
