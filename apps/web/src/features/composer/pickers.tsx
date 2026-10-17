import {
  BrainIcon,
  ChevronDownIcon,
  SearchIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Model } from '@offsite/core/protocol'
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
import { limitLabel } from '@/features/composer/limits'
import {
  changeSettings,
  getState,
  machineOf,
  providerSettings,
  showError,
  showSettingsPage,
  useStore,
} from '@/lib/store'
import { cn } from '@/lib/utils'

export const control =
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-(--control-radius) border border-transparent outline-none hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:shrink-0'
const controlSm =
  'h-7 gap-1.5 px-2.5 text-sm font-medium text-secondary-label hover:text-foreground [&_svg:not([class*=text-])]:text-muted-foreground [&_svg:not([class*=size-])]:size-4'

export function Pickers() {
  const settings = useStore((state) => state.settings)
  const capabilities = useStore((state) => state.capabilities)
  const models = capabilities?.models ?? []
  const modelValue = settings.model ?? 'default'
  const model = models.find((item) => item.value === modelValue)

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
            { value: 'default', label: 'Default' },
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
  const accounts = (
    useStore(
      (state) =>
        state.machines.find(
          (machine) => machine.id === state.selection?.machine
        )?.accounts
    ) ?? []
  ).filter(
    (item) =>
      item.valid &&
      (selection?.sessionId === null || item.provider === settings.provider)
  )
  const capabilities = useStore((state) => state.capabilities)
  const [open, setOpen] = useState(false)
  const [viewed, setViewed] = useState(settings.accountId)
  const [query, setQuery] = useState('')
  const [fetched, setFetched] = useState<Record<string, Model[]>>({})
  const searchInput = useRef<HTMLInputElement>(null)
  const modelValue = settings.model ?? 'default'
  const model = capabilities?.models.find((item) => item.value === modelValue)
  const account = accounts.find((item) => item.id === settings.accountId)
  const viewedModels =
    viewed === null
      ? []
      : viewed === settings.accountId
        ? (capabilities?.models ?? null)
        : (fetched[viewed] ?? null)
  const search = query.trim().toLowerCase()
  const matches = (viewedModels ?? []).filter((option) =>
    `${option.name} ${option.description}`.toLowerCase().includes(search)
  )

  function changeOpen(next: boolean) {
    setOpen(next)
    if (!next) return
    setViewed(settings.accountId)
    setQuery('')
    if (selection === null) return
    for (const item of accounts) {
      if (item.id === settings.accountId || item.error !== null) continue
      call(selection.machine, 'capabilities', {
        accountId: item.id,
        projectId: selection.projectId,
      }).then(
        (result) =>
          setFetched((current) => ({ ...current, [item.id]: result.models })),
        showError
      )
    }
  }

  function pick(accountId: string, value: string) {
    const model = value === 'default' ? null : value
    const provider = accounts.find((item) => item.id === accountId)?.provider
    if (provider === undefined || selection === null) return
    if (provider === settings.provider) changeSettings({ accountId, model })
    else
      changeSettings({
        ...providerSettings(
          machineOf(getState(), selection.machine).config,
          provider
        ),
        accountId,
        model,
      })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(control, controlSm)}
          title={
            account === undefined
              ? 'Model'
              : `${account.name} · ${model?.name ?? modelValue}`
          }
        >
          <ProviderIcon provider={settings.provider} className="size-4" />
          <span className="max-w-40 truncate">{model?.name ?? modelValue}</span>
          {accounts.length > 1 && account !== undefined && (
            <span className="text-muted-foreground max-w-28 truncate font-normal">
              {account.name}
            </span>
          )}
          <HugeiconsIcon
            icon={ChevronDownIcon}
            strokeWidth={2.25}
            className="text-icon-muted size-3.5"
          />
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
        {accounts.length > 0 && (
          <div className="bg-muted/30 flex w-11 shrink-0 [scrollbar-width:none] flex-col gap-1 overflow-y-auto p-1">
            {accounts.map((item) => (
              <div key={item.id} className="relative w-full">
                {item.id === viewed && (
                  <div className="bg-primary pointer-events-none absolute top-1/2 -right-1 z-10 h-5 w-0.75 -translate-y-1/2 rounded-l-full" />
                )}
                <Tooltip
                  side="left"
                  label={
                    item.error === null
                      ? [
                          item.name,
                          item.email,
                          item.plan,
                          ...item.limits.map(limitLabel),
                        ]
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
                    aria-pressed={item.id === viewed}
                    aria-disabled={item.error !== null}
                    onClick={() => {
                      if (item.error !== null) return
                      setViewed(item.id)
                    }}
                  >
                    <ProviderIcon provider={item.provider} className="size-5" />
                    <span className="bg-card text-muted-foreground text-3xs pointer-events-none absolute right-0.5 bottom-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border px-0.5 leading-none font-semibold shadow-sm">
                      {item.name.charAt(0).toUpperCase()}
                    </span>
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
        <div
          className={cn(
            'bg-muted/40 flex min-h-0 min-w-0 flex-1 flex-col',
            accounts.length > 0 && 'border-border/70 border-l'
          )}
        >
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
                  if (event.key !== 'Enter' || viewed === null) return
                  const first = matches.at(0)
                  if (first === undefined) return
                  event.preventDefault()
                  pick(viewed, first.value)
                }}
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
            {viewedModels === null ? (
              <p className="text-muted-foreground p-2 text-center text-sm">
                Loading models…
              </p>
            ) : matches.length === 0 ? (
              <p className="text-muted-foreground p-2 text-center text-sm">
                No models found
              </p>
            ) : (
              matches.map((option) => (
                <button
                  key={option.value}
                  className={cn(
                    'hover:bg-accent hover:text-accent-foreground mb-0.5 flex min-h-7 w-full cursor-pointer flex-col rounded-sm px-2 py-1 text-left',
                    viewed === settings.accountId &&
                      option.value === modelValue &&
                      'text-foreground bg-foreground/[0.08]'
                  )}
                  onClick={() => {
                    if (viewed === null) return
                    pick(viewed, option.value)
                  }}
                >
                  <span className="truncate text-xs leading-snug font-medium">
                    {option.name}
                  </span>
                  {option.description !== '' && (
                    <span className="text-muted-foreground/70 mt-1 truncate text-xs leading-snug">
                      {option.description}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
          <div className="border-border/70 shrink-0 border-t px-3 py-2 text-xs">
            <button
              className="text-foreground cursor-pointer font-medium underline-offset-2 hover:underline"
              onClick={() => {
                setOpen(false)
                showSettingsPage('Accounts')
              }}
            >
              Manage accounts…
            </button>
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
          <HugeiconsIcon
            icon={ChevronDownIcon}
            strokeWidth={2.25}
            className="text-icon-muted size-3.5"
          />
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
