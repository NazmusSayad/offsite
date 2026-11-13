import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Model } from '@offsite/core/providers'
import { useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { HotkeyHint } from '@/components/hotkey-hint'
import { ProviderIcon } from '@/components/icons'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { changeSettings } from '@/lib/accounts'
import { useStore } from '@/lib/store'
import { cn, touch } from '@/lib/utils'
import { focusModel, ModelMenu } from './model-menu'
import { control, controlSm, Picker, refocusComposer } from './picker'

export function Pickers() {
  const settings = useStore((state) => state.settings)
  const capabilities = useStore((state) => state.capabilities)
  const model = capabilities?.models.find(
    (item) => item.value === settings.model
  )

  return (
    <>
      <ModelPicker />
      {model !== undefined && model.efforts.length > 0 && (
        <>
          <span className="bg-muted-foreground/25 mx-px h-2 w-px shrink-0 md:hidden" />
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            className="text-muted-foreground/60 -mx-1 hidden size-3.5 shrink-0 md:block"
          />
          <Picker
            title="Effort"
            shortcut={['mod+shift+e', 'mod+slash']}
            hint="/"
            trigger={
              <span className="capitalize">{settings.effort ?? 'Default'}</span>
            }
            value={settings.effort ?? 'default'}
            options={[
              ...(settings.provider === 'opencode'
                ? [{ value: 'default', label: 'Default' }]
                : []),
              ...model.efforts.map((effort) => ({
                value: effort,
                label: effort.charAt(0).toUpperCase() + effort.slice(1),
              })),
            ]}
            onChange={(value) => {
              const effort = value === 'default' ? null : value
              changeSettings({ effort })
            }}
          />
        </>
      )}
    </>
  )
}

function ModelPicker() {
  const settings = useStore((state) => state.settings)
  const selection = useStore((state) => state.selection)
  const machine = useStore((state) =>
    state.machines.find((item) => item.id === state.selection?.machine)
  )
  const choices = [
    ...[...(machine?.claudeAccounts ?? []), ...(machine?.codexAccounts ?? [])]
      .filter((item) => item.valid)
      .map((item) => ({
        key: item.id,
        provider: item.provider,
        accountId: item.id as string | null,
        name: item.name,
        color: item.color,
        plan: item.plan,
        error: item.error,
      })),
    ...(machine?.openCode.available === true
      ? [
          {
            key: 'opencode',
            provider: 'opencode' as const,
            accountId: null,
            name: 'OpenCode',
            color: null,
            plan: null,
            error: null,
          },
        ]
      : []),
  ].filter(
    (item) =>
      selection?.sessionId === null || item.provider === settings.provider
  )
  const current =
    settings.provider === 'opencode' ? 'opencode' : settings.accountId
  const capabilities = useStore((state) => state.capabilities)
  const [open, setOpen] = useState(false)
  const [fetched, setFetched] = useState<Record<string, Model[]>>({})
  const model = capabilities?.models.find(
    (item) => item.value === settings.model
  )
  const label = model?.name ?? settings.model ?? 'Choose a model'
  const account = choices.find((item) => item.key === current)
  useHotkeys(['mod+shift+m', 'mod+period'], () => setOpen(!open), {
    enableOnFormTags: true,
    enableOnContentEditable: true,
    preventDefault: true,
  })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(control, controlSm)}
          title={account === undefined ? 'Model' : `${account.name} · ${label}`}
        >
          <span className="relative">
            <ProviderIcon
              provider={settings.provider}
              className="size-3.5 md:size-4"
            />
            {choices.filter((item) => item.provider === settings.provider)
              .length > 1 &&
              account !== undefined && (
                <span
                  className={cn(
                    'pointer-events-none absolute -right-1 -bottom-1 flex h-3 min-w-3 items-center justify-center rounded-full border px-0.5 text-[8px] leading-none font-semibold shadow-sm',
                    account.color === null
                      ? 'bg-card text-muted-foreground'
                      : 'border-card text-white'
                  )}
                  style={
                    account.color === null
                      ? undefined
                      : { backgroundColor: account.color }
                  }
                >
                  {account.name.charAt(0).toUpperCase()}
                </span>
              )}
          </span>
          <span className="max-w-40 truncate">{label}</span>
          <HotkeyHint keyName="." placement="above" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-screen max-w-90"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (touch.matches) {
            return
          }
          if (!(event.currentTarget instanceof HTMLElement)) {
            throw new Error('model picker is not an element')
          }
          focusModel(event.currentTarget)
        }}
        onCloseAutoFocus={refocusComposer}
      >
        <ModelMenu
          choices={choices}
          fetched={fetched}
          onFetched={setFetched}
          onClose={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}
