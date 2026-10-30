import type { Account } from '@offsite/core/providers'
import { useState } from 'react'
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
import { update } from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { Row, Section, TextInput } from './controls'

export function AccountPage(props: { machine: string; account: Account }) {
  const account = props.account
  const [error, setError] = useState<string | null>(null)

  async function save(
    patch: Partial<Pick<Account, 'name' | 'color' | 'configDir'>>
  ) {
    setError(null)
    try {
      await call(props.machine, 'accounts.update', {
        id: account.id,
        name: account.name,
        color: account.color,
        configDir: account.configDir,
        enabled: account.enabled,
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
        <Row label="Color">
          <div className="flex items-center gap-2">
            {account.color !== null && (
              <span
                className="size-5 shrink-0 rounded-full"
                style={{ backgroundColor: account.color }}
              />
            )}
            <TextInput
              key={account.color ?? ''}
              className="w-28 font-mono"
              value={account.color ?? ''}
              placeholder="#3b82f6"
              valid={(text) => text === '' || /^#[0-9a-f]{6}$/i.test(text)}
              onCommit={(color) =>
                void save({ color: color === '' ? null : color })
              }
            />
          </div>
        </Row>
        <Row label="Config directory">
          <TextInput
            key={account.configDir ?? ''}
            className="w-72 font-mono"
            value={account.configDir ?? ''}
            placeholder={
              account.provider === 'claude'
                ? '~/.claude or empty for default'
                : '~/.codex or empty for default'
            }
            onCommit={(configDir) => void save({ configDir })}
          />
        </Row>
      </Section>
      {error !== null && (
        <p className="text-destructive px-1 text-xs">{error}</p>
      )}
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
              OffSite stops using this account. Its config directory and
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
              props.provider === 'claude'
                ? '~/.claude or empty for default'
                : '~/.codex or empty for default'
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
        <Button type="submit" disabled={busy || name.trim() === ''}>
          Add account
        </Button>
      </div>
    </form>
  )
}
