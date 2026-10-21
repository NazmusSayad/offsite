import {
  BrainIcon,
  SearchIcon,
  UserSettings01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Model } from '@offsite/core/providers'
import { type ReactNode, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { ProviderIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tooltip } from '@/components/ui/tooltip'
import { changeSettings, providerSettings } from '@/lib/accounts'
import {
  getState,
  machineOf,
  providerPages,
  showError,
  showSettingsPage,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'

export const control =
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-(--control-radius) border border-transparent outline-none hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:shrink-0'
const controlSm =
  'h-7 gap-1.5 px-1.5 text-sm sm:px-2.5 font-medium text-secondary-label hover:text-foreground [&_svg:not([class*=text-])]:text-muted-foreground [&_svg:not([class*=size-])]:size-4'

export function Pickers() {
  const settings = useStore((state) => state.settings)
  const capabilities = useStore((state) => state.capabilities)
  const model = capabilities?.models.find(
    (item) => item.value === settings.model
  )

  return (
    <>
      <ModelPicker />
      <span className="bg-border mx-0.5 hidden h-4 w-px shrink-0 sm:block" />
      {model !== undefined && model.efforts.length > 0 && (
        <Picker
          title="Effort"
          trigger={
            <>
              <HugeiconsIcon icon={BrainIcon} />
              <span className="capitalize">{settings.effort ?? 'Default'}</span>
            </>
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
          onChange={(value) =>
            changeSettings({ effort: value === 'default' ? null : value })
          }
        />
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
  const [viewed, setViewed] = useState(current)
  const [query, setQuery] = useState('')
  const [fetched, setFetched] = useState<Record<string, Model[]>>({})
  const searchInput = useRef<HTMLInputElement>(null)
  const model = capabilities?.models.find(
    (item) => item.value === settings.model
  )
  const label = model?.name ?? settings.model ?? 'Choose a model'
  const account = choices.find((item) => item.key === current)
  const viewedModels =
    viewed === null
      ? []
      : viewed === current
        ? (capabilities?.models ?? null)
        : (fetched[viewed] ?? null)
  const viewedProvider = choices.find((item) => item.key === viewed)?.provider
  const visible = (viewedModels ?? []).filter((option) => !option.hidden)
  const searchable = visible.length >= 5
  const search = searchable ? query.trim().toLowerCase() : ''
  const matches = visible.filter((option) =>
    `${option.name} ${option.description}`.toLowerCase().includes(search)
  )

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) {
      return
    }
    setViewed(current)
    setQuery('')
    if (selection === null) {
      return
    }
    for (const item of choices) {
      if (item.key === current || item.error !== null) {
        continue
      }
      call(selection.machine, 'capabilities', {
        provider: item.provider,
        accountId: item.accountId,
        projectId: selection.projectId,
      }).then(
        (result) =>
          setFetched((models) => ({ ...models, [item.key]: result.models })),
        showError
      )
    }
  }

  function pick(key: string, option: Model) {
    const picked = choices.find((item) => item.key === key)
    if (picked === undefined || selection === null) {
      return
    }
    const provider = picked.provider
    const choice = {
      accountId: picked.accountId,
      model: option.value,
      ...(option.effort === null ? {} : { effort: option.effort }),
    }
    if (provider === settings.provider) {
      changeSettings(choice)
    } else {
      changeSettings({
        ...providerSettings(
          machineOf(getState(), selection.machine).composer,
          provider
        ),
        ...choice,
      })
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(control, controlSm)}
          title={account === undefined ? 'Model' : `${account.name} · ${label}`}
        >
          <span className="relative">
            <ProviderIcon provider={settings.provider} className="size-4" />
            {choices.filter((item) => item.provider === settings.provider)
              .length > 1 &&
              account !== undefined && (
                <span className="bg-card text-muted-foreground pointer-events-none absolute -right-1 -bottom-1 flex h-3 min-w-3 items-center justify-center rounded-full border px-0.5 text-[8px] leading-none font-semibold shadow-sm">
                  {account.name.charAt(0).toUpperCase()}
                </span>
              )}
          </span>
          <span className="max-w-40 truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="flex max-h-86.5 w-screen max-w-90 flex-row"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          searchInput.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLElement>('[data-composer]')?.focus()
        }}
      >
        {choices.length > 1 && (
          <div className="bg-muted/30 flex w-11 shrink-0 [scrollbar-width:none] flex-col gap-1 overflow-y-auto p-1">
            {choices.map((item) => (
              <div key={item.key} className="relative w-full">
                {item.key === viewed && (
                  <div className="bg-primary pointer-events-none absolute top-1/2 -right-1 z-10 h-5 w-0.75 -translate-y-1/2 rounded-l-full" />
                )}
                <Tooltip
                  side="left"
                  label={
                    item.error === null
                      ? [item.name, item.plan]
                          .filter((part) => part !== null)
                          .join(' · ')
                      : `${item.name} — ${item.error}`
                  }
                >
                  <button
                    className={cn(
                      'hover:bg-foreground/10 focus-visible:bg-foreground/10 relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none',
                      item.error !== null &&
                        'cursor-not-allowed opacity-50 hover:bg-transparent'
                    )}
                    aria-label={item.name}
                    aria-pressed={item.key === viewed}
                    aria-disabled={item.error !== null}
                    onClick={() => {
                      if (item.error !== null) {
                        return
                      }
                      const same = fetched[item.key]?.find(
                        (option) => option.value === settings.model
                      )
                      if (
                        item.key !== current &&
                        current !== null &&
                        capabilities !== null &&
                        same !== undefined
                      ) {
                        setFetched((models) => ({
                          ...models,
                          [current]: capabilities.models,
                        }))
                        pick(item.key, same)
                      }
                      setViewed(item.key)
                    }}
                  >
                    <ProviderIcon provider={item.provider} className="size-5" />
                    {choices.filter((other) => other.provider === item.provider)
                      .length > 1 && (
                      <span className="bg-card text-muted-foreground text-3xs pointer-events-none absolute right-0.5 bottom-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border px-0.5 leading-none font-semibold shadow-sm">
                        {item.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </button>
                </Tooltip>
              </div>
            ))}
            <Tooltip side="left" label="Manage accounts">
              <button
                className="text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:bg-foreground/10 mt-auto flex aspect-square w-full shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-none"
                aria-label="Manage accounts"
                onClick={() => {
                  setOpen(false)
                  showSettingsPage(providerPages[settings.provider])
                }}
              >
                <HugeiconsIcon icon={UserSettings01Icon} className="size-4.5" />
              </button>
            </Tooltip>
          </div>
        )}
        <div
          className={cn(
            'bg-muted/40 flex min-h-0 min-w-0 flex-1 flex-col',
            choices.length > 1 && 'border-border/70 border-l'
          )}
        >
          {searchable && (
            <div className="shrink-0 px-3 pt-2.5">
              <div className="border-border/70 focus-within:border-ring relative border-b pb-1.5 transition-colors">
                <HugeiconsIcon
                  icon={SearchIcon}
                  className="text-muted-foreground/55 pointer-events-none absolute top-1.5 left-0 size-4"
                />
                <input
                  ref={searchInput}
                  value={query}
                  placeholder="Search models..."
                  className="placeholder:text-muted-foreground/70 h-6.5 w-full bg-transparent ps-5 text-sm outline-none"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || viewed === null) {
                      return
                    }
                    const first = matches.at(0)
                    if (first === undefined) {
                      return
                    }
                    event.preventDefault()
                    pick(viewed, first)
                    setOpen(false)
                  }}
                />
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
            {matches.length === 0 ? (
              <p className="text-muted-foreground p-2 text-center text-sm">
                {viewedModels === null ? 'Loading models…' : 'No models found'}
              </p>
            ) : (
              matches.map((option) => (
                <button
                  key={option.value}
                  className={cn(
                    'hover:bg-accent hover:text-accent-foreground mb-0.5 flex min-h-8 w-full cursor-pointer flex-col justify-center rounded-sm px-2 py-1.5 text-left',
                    viewed === current &&
                      option.value === settings.model &&
                      'text-foreground bg-foreground/[0.08]'
                  )}
                  onClick={() => {
                    if (viewed === null) {
                      return
                    }
                    pick(viewed, option)
                    setOpen(false)
                  }}
                >
                  <span className="truncate text-sm leading-snug font-medium">
                    {option.name}
                    {viewedProvider === 'opencode' && (
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Picker(props: {
  title: string
  trigger: ReactNode
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn(control, controlSm)} title={props.title}>
          {props.trigger}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-72"
        side="top"
        align="start"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLElement>('[data-composer]')?.focus()
        }}
      >
        <DropdownMenuLabel>{props.title}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={props.value}
          onValueChange={props.onChange}
        >
          {props.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
