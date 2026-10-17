import { Delete02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Account, Config, Provider } from '@offsite/core/protocol'
import { useState } from 'react'
import { call } from '@/api/connection'
import { updateConfig } from '@/api/machine-config'
import { ProviderIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { providerNames } from '@/lib/format'
import { cn, errorMessage } from '@/lib/utils'
import { Row, Section, TextInput } from './controls'

export function AccountsPage(props: {
  machine: string
  config: Config
  accounts: Account[]
}) {
  const config = props.config
  const accounts = props.accounts.filter(
    (account) => account.provider !== 'opencode'
  )
  const [provider, setProvider] = useState<Provider>('claude')
  const [name, setName] = useState('')
  const [configDir, setConfigDir] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<null>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Section
        title="Claude"
        note="Threads are read from this directory. Every account links to it."
      >
        <Row label="Base directory">
          <TextInput
            key={config.claudeBaseDir}
            className="w-72 font-mono"
            value={config.claudeBaseDir}
            valid={(text) => text.trim() !== ''}
            onCommit={(claudeBaseDir) =>
              updateConfig(props.machine, { ...config, claudeBaseDir })
            }
          />
        </Row>
      </Section>
      <Section
        title="Commit messages"
        note="The model that writes commit messages for each provider. Leave it empty to turn it off. OpenCode models look like provider/model."
      >
        {(['claude', 'codex', 'opencode'] as const).map((item) => (
          <Row key={item} label={providerNames[item]}>
            <TextInput
              key={config.commitModels[item]}
              className="w-56 font-mono"
              value={config.commitModels[item] ?? ''}
              onCommit={(model) =>
                updateConfig(props.machine, {
                  ...config,
                  commitModels: {
                    ...config.commitModels,
                    [item]: model.trim() === '' ? null : model.trim(),
                  },
                })
              }
            />
          </Row>
        ))}
      </Section>
      {accounts.length > 0 && (
        <Section
          title="Accounts"
          note="Accounts of a provider share the same sessions. Pick one per message from the composer."
        >
          {accounts.map((account) => (
            <div key={account.id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-2">
                <ProviderIcon
                  provider={account.provider}
                  className="size-4 shrink-0"
                />
                <TextInput
                  key={account.name}
                  className="w-40"
                  value={account.name}
                  valid={(text) => text.trim() !== ''}
                  onCommit={(name) =>
                    void run(() =>
                      call(props.machine, 'accounts.update', {
                        id: account.id,
                        name,
                        configDir: account.configDir,
                      })
                    )
                  }
                />
                <TextInput
                  key={account.configDir}
                  className="min-w-0 flex-1 font-mono"
                  value={account.configDir}
                  valid={(text) => text.trim() !== ''}
                  onCommit={(dir) =>
                    void run(() =>
                      call(props.machine, 'accounts.update', {
                        id: account.id,
                        name: account.name,
                        configDir: dir,
                      })
                    )
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="Remove account"
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      call(props.machine, 'accounts.remove', { id: account.id })
                    )
                  }
                >
                  <HugeiconsIcon icon={Delete02Icon} />
                </Button>
              </div>
              <div
                className={cn(
                  'truncate text-xs',
                  account.error === null
                    ? 'text-muted-foreground'
                    : 'text-destructive'
                )}
              >
                {account.error ??
                  [account.email, account.plan]
                    .filter((part) => part !== null)
                    .join(' · ')}
              </div>
              {!account.linked && account.provider === 'codex' && (
                <p className="text-warning text-xs">
                  Does not mirror <code className="font-mono">~/.codex</code>,
                  so it is not offered in the composer. To share threads, link
                  every entry of <code className="font-mono">~/.codex</code>{' '}
                  into <code className="font-mono">{account.configDir}</code>{' '}
                  except <code className="font-mono">auth.json</code>,{' '}
                  <code className="font-mono">models_cache.json</code>,{' '}
                  <code className="font-mono">log</code>,{' '}
                  <code className="font-mono">memories</code> and{' '}
                  <code className="font-mono">tmp</code>.
                </p>
              )}
              {!account.linked && account.provider === 'claude' && (
                <p className="text-warning text-xs">
                  Not linked to the base directory, so it is not offered in the
                  composer. To share threads, replace{' '}
                  <code className="font-mono">
                    {account.configDir}/projects
                  </code>{' '}
                  with a link to{' '}
                  <code className="font-mono">
                    {config.claudeBaseDir}/projects
                  </code>
                  .
                </p>
              )}
            </div>
          ))}
        </Section>
      )}
      {props.accounts.some((account) => account.provider === 'opencode') && (
        <Section title="OpenCode">
          <div className="flex items-start gap-2 px-4 py-3">
            <ProviderIcon
              provider="opencode"
              className="mt-0.5 size-4 shrink-0"
            />
            <p className="text-muted-foreground text-xs">
              OpenCode has no accounts. It keeps its own logins for model
              providers. Connect them with{' '}
              <code className="font-mono">opencode auth login</code> in a
              terminal.
            </p>
          </div>
        </Section>
      )}
      <Section title="Add an account">
        <form
          className="flex flex-col gap-2 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault()
            void run(() =>
              call(props.machine, 'accounts.add', {
                provider,
                name,
                configDir,
              })
            ).then((added) => {
              if (!added) return
              setName('')
              setConfigDir('')
            })
          }}
        >
          <Select
            value={provider}
            onValueChange={(value: Provider) => setProvider(value)}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="claude">Claude</SelectItem>
              <SelectItem value="codex">Codex</SelectItem>
            </SelectContent>
          </Select>
          {provider === 'claude' ? (
            <p className="text-muted-foreground text-xs">
              Each account is a Claude config directory. To sign in to a new
              one, run{' '}
              <code className="font-mono">
                CLAUDE_CONFIG_DIR=~/.claude-work claude
              </code>{' '}
              in a terminal and log in.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              Each account is a Codex home directory. Use{' '}
              <code className="font-mono">~/.codex</code> for your main login.
              To sign in to another, run{' '}
              <code className="font-mono">
                CODEX_HOME=~/.codex-work codex login
              </code>{' '}
              in a terminal.
            </p>
          )}
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name, e.g. Work"
          />
          <Input
            value={configDir}
            onChange={(event) => setConfigDir(event.target.value)}
            placeholder={
              provider === 'claude'
                ? 'Config directory, e.g. ~/.claude-work'
                : 'Codex home, e.g. ~/.codex'
            }
          />
          {error !== null && (
            <p className="text-destructive text-xs">{error}</p>
          )}
          <Button
            type="submit"
            className="self-end"
            disabled={busy || name.trim() === '' || configDir.trim() === ''}
          >
            Add account
          </Button>
        </form>
      </Section>
    </>
  )
}
