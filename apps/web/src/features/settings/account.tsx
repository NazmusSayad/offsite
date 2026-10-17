import type {
  Account,
  Capabilities,
  ModelSetting,
} from '@offsite/core/protocol'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { update } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'
import { Row, Section, TextInput } from './controls'

export function AccountPage(props: {
  machine: string
  settings: Record<string, ModelSetting>
  account: Account
}) {
  const account = props.account
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const models = capabilities === null ? null : capabilities.models

  useEffect(() => {
    let current = true
    setCapabilities(null)
    setModelsError(null)
    call(props.machine, 'capabilities', {
      accountId: account.id,
      projectId: null,
    }).then(
      (result) => {
        if (current) setCapabilities(result)
      },
      (caught: unknown) => {
        if (current) setModelsError(errorMessage(caught))
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, account.id, account.configDir])

  async function save(
    patch: Partial<Pick<Account, 'name' | 'configDir' | 'hiddenModels'>>
  ) {
    setError(null)
    try {
      await call(props.machine, 'accounts.update', {
        id: account.id,
        name: account.name,
        configDir: account.configDir,
        enabled: account.enabled,
        hiddenModels: account.hiddenModels,
        ...patch,
      })
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  async function remove() {
    setError(null)
    try {
      await call(props.machine, 'accounts.remove', { id: account.id })
      update({ settingsAccount: null })
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <>
      <Section title="Account">
        <Row label="Name">
          <TextInput
            key={account.name}
            value={account.name}
            valid={(text) => text.trim() !== ''}
            onCommit={(name) => void save({ name })}
          />
        </Row>
        <Row label="Config directory">
          <TextInput
            key={account.configDir}
            className="w-72 font-mono"
            value={account.configDir}
            valid={(text) => text.trim() !== ''}
            onCommit={(configDir) => void save({ configDir })}
          />
        </Row>
      </Section>
      {error !== null && (
        <p className="text-destructive px-1 text-xs">{error}</p>
      )}
      <Section title="Models" note="Overrides the provider settings">
        {modelsError !== null && (
          <p className="text-destructive px-4 py-3 text-xs">{modelsError}</p>
        )}
        {modelsError === null && models === null && (
          <p className="text-muted-foreground px-4 py-3 text-xs">Loading…</p>
        )}
        {(models ?? []).map((model) => {
          const providerHidden =
            props.settings[model.value]?.hidden ?? model.deprecated
          const override = account.hiddenModels[model.value]
          const hidden = override ?? providerHidden
          return (
            <div
              key={model.value}
              className="flex min-h-11 items-center gap-3 px-4 py-1.5"
            >
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  hidden && 'text-muted-foreground'
                )}
              >
                {model.name}
              </span>
              {override !== undefined && (
                <span className="text-muted-foreground text-xs">Override</span>
              )}
              <Switch
                size="sm"
                checked={!hidden}
                onCheckedChange={(shown) => {
                  const hiddenModels = { ...account.hiddenModels }
                  if (!shown === providerHidden)
                    delete hiddenModels[model.value]
                  else hiddenModels[model.value] = !shown
                  void save({ hiddenModels })
                }}
                aria-label={`Show ${model.name}`}
              />
            </div>
          )
        })}
      </Section>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="text-destructive">
            Remove account
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {account.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              offsite stops using this account. Its config directory and
              sessions stay untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void remove()}
            >
              Remove account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function NewAccountPage(props: {
  machine: string
  provider: 'claude' | 'codex'
}) {
  const [name, setName] = useState('')
  const [configDir, setConfigDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setBusy(true)
    setError(null)
    try {
      await call(props.machine, 'accounts.add', {
        provider: props.provider,
        name,
        configDir,
      })
      update({ settingsAccount: null })
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        void add()
      }}
    >
      <Section title="Account">
        <Row label="Name">
          <Input
            className="w-56"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Work"
          />
        </Row>
        <Row label="Config directory">
          <Input
            className="w-72 font-mono"
            value={configDir}
            onChange={(event) => setConfigDir(event.target.value)}
            placeholder={
              props.provider === 'claude' ? '~/.claude-work' : '~/.codex-work'
            }
          />
        </Row>
      </Section>
      {error !== null && (
        <p className="text-destructive px-1 text-xs">{error}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => update({ settingsAccount: null })}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={busy || name.trim() === '' || configDir.trim() === ''}
        >
          Add account
        </Button>
      </div>
    </form>
  )
}
