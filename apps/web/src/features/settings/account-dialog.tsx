import type { Account, Model, ModelSetting } from '@offsite/core/protocol'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { providerNames } from '@/lib/format'
import { cn, errorMessage } from '@/lib/utils'

export function AccountDialog(props: {
  machine: string
  provider: 'claude' | 'codex'
  settings: Record<string, ModelSetting>
  account: Account | null
  onClose: () => void
}) {
  const account = props.account
  const [name, setName] = useState(account === null ? '' : account.name)
  const [configDir, setConfigDir] = useState(
    account === null ? '' : account.configDir
  )
  const [hiddenModels, setHiddenModels] = useState(
    account === null ? {} : account.hiddenModels
  )
  const [models, setModels] = useState<Model[] | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (account === null) return
    let current = true
    call(props.machine, 'capabilities', {
      accountId: account.id,
      projectId: null,
    }).then(
      (capabilities) => {
        if (current) setModels(capabilities.models)
      },
      (caught: unknown) => {
        if (current) setModelsError(errorMessage(caught))
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, account])

  async function save() {
    setBusy(true)
    setError(null)
    try {
      if (account === null)
        await call(props.machine, 'accounts.add', {
          provider: props.provider,
          name,
          configDir,
        })
      else
        await call(props.machine, 'accounts.update', {
          id: account.id,
          name,
          configDir,
          enabled: account.enabled,
          hiddenModels,
        })
      props.onClose()
    } catch (caught) {
      setError(errorMessage(caught))
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {account === null
                ? `Add ${providerNames[props.provider]} account`
                : 'Edit account'}
            </DialogTitle>
          </DialogHeader>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Name
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Work"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Config directory
            <Input
              className="font-mono"
              value={configDir}
              onChange={(event) => setConfigDir(event.target.value)}
              placeholder={
                props.provider === 'claude' ? '~/.claude-work' : '~/.codex-work'
              }
            />
          </label>
          {account !== null && (
            <div className="flex flex-col gap-1.5 text-sm font-medium">
              Models
              <div className="max-h-64 divide-y overflow-y-auto rounded-lg border font-normal">
                {modelsError !== null && (
                  <p className="text-destructive px-3 py-2 text-xs">
                    {modelsError}
                  </p>
                )}
                {modelsError === null && models === null && (
                  <p className="text-muted-foreground px-3 py-2 text-xs">
                    Loading…
                  </p>
                )}
                {(models ?? []).map((model) => {
                  const providerHidden =
                    props.settings[model.value]?.hidden ?? model.deprecated
                  const override = hiddenModels[model.value]
                  const hidden = override ?? providerHidden
                  return (
                    <div
                      key={model.value}
                      className="flex h-9 items-center gap-3 px-3"
                    >
                      <span
                        className={cn(
                          'min-w-0 flex-1 truncate',
                          hidden && 'text-muted-foreground'
                        )}
                      >
                        {model.name}
                      </span>
                      {override !== undefined && (
                        <span className="text-muted-foreground text-xs">
                          Override
                        </span>
                      )}
                      <Switch
                        size="sm"
                        checked={!hidden}
                        onCheckedChange={(shown) => {
                          const next = { ...hiddenModels }
                          if (!shown === providerHidden)
                            delete next[model.value]
                          else next[model.value] = !shown
                          setHiddenModels(next)
                        }}
                        aria-label={`Show ${model.name}`}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {error !== null && (
            <p className="text-destructive text-xs">{error}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={props.onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || name.trim() === '' || configDir.trim() === ''}
            >
              {account === null ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
