import {
  BrainIcon,
  SearchIcon,
  UserSettings01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Model, Provider } from '@offsite/core/providers'
import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { useHotkeys } from 'react-hotkeys-hook'
import { call } from '@/api/connection'
import { ProviderIcon } from '@/components/icons'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Tooltip } from '@/components/ui/tooltip'
import { changeSettings, providerSettings, saveLastUsed } from '@/lib/accounts'
import {
  getState,
  machineOf,
  providerPages,
  showError,
  showSettingsPage,
  useStore,
} from '@/lib/store'
import { cn, touch } from '@/lib/utils'
import { moveFocus } from './move-focus'
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
      <span className="bg-border mx-0.5 hidden h-4 w-px shrink-0 sm:block" />
      {model !== undefined && model.efforts.length > 0 && (
        <Picker
          title="Effort"
          shortcut={['mod+shift+e', 'mod+slash']}
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
            <ProviderIcon provider={settings.provider} className="size-4" />
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

function ModelMenu(props: {
  choices: {
    key: string
    provider: Provider
    accountId: string | null
    name: string
    color: string | null
    plan: string | null
    error: string | null
  }[]
  fetched: Record<string, Model[]>
  onFetched: Dispatch<SetStateAction<Record<string, Model[]>>>
  onClose: () => void
}) {
  const settings = useStore((state) => state.settings)
  const selection = useStore((state) => state.selection)
  const capabilities = useStore((state) => state.capabilities)
  const current =
    settings.provider === 'opencode' ? 'opencode' : settings.accountId
  const [viewed, setViewed] = useState(current)
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const viewedModels =
    viewed === null
      ? []
      : viewed === current
        ? (capabilities?.models ?? null)
        : (props.fetched[viewed] ?? null)
  const viewedProvider = props.choices.find(
    (item) => item.key === viewed
  )?.provider
  const visible = (viewedModels ?? []).filter((option) => !option.hidden)
  const searchable = visible.length >= 5
  const search = searchable ? query.trim().toLowerCase() : ''
  const matches = visible.filter((option) =>
    `${option.name} ${option.description}`.toLowerCase().includes(search)
  )

  const loadModels = useEffectEvent(() => {
    if (selection === null) {
      return
    }
    for (const item of props.choices) {
      if (item.key === current || item.error !== null) {
        continue
      }
      call(selection.machine, 'capabilities', {
        provider: item.provider,
        accountId: item.accountId,
        projectId: selection.projectId,
      }).then(
        (result) =>
          props.onFetched((models) => ({
            ...models,
            [item.key]: result.models,
          })),
        showError
      )
    }
  })

  useEffect(() => {
    loadModels()
  }, [])

  function view(key: string) {
    const same = props.fetched[key]?.find(
      (option) => option.value === settings.model
    )
    if (
      key !== current &&
      current !== null &&
      capabilities !== null &&
      same !== undefined
    ) {
      props.onFetched((models) => ({
        ...models,
        [current]: capabilities.models,
      }))
      pick(key, same)
    }
    flushSync(() => setViewed(key))
    if (touch.matches) {
      return
    }
    if (root.current === null) {
      throw new Error('model menu is not mounted')
    }
    focusModel(root.current)
  }

  function pick(key: string, option: Model) {
    const picked = props.choices.find((item) => item.key === key)
    if (picked === undefined || selection === null) {
      return
    }
    const provider = picked.provider
    const choice = {
      accountId: picked.accountId,
      model: option.value,
      ...(option.effort === null ? {} : { effort: option.effort }),
    }
    saveLastUsed(selection.machine, provider, picked.accountId, option.value)
    if (provider === settings.provider) {
      changeSettings(choice)
    } else {
      changeSettings({
        ...providerSettings(
          machineOf(getState(), selection.machine).lastUsed,
          provider
        ),
        ...choice,
      })
    }
  }

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="flex max-h-86.5 flex-row outline-none"
      onKeyDown={(event) => {
        const typing =
          document.activeElement === searchInput.current && query !== ''
        if (
          (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') ||
          typing
        ) {
          moveFocus(event, 'ArrowUp', 'ArrowDown', 'input, [data-model]')
          return
        }
        event.preventDefault()
        const usable = props.choices.filter((item) => item.error === null)
        const index = usable.findIndex((item) => item.key === viewed)
        const step = event.key === 'ArrowRight' ? 1 : -1
        const next = usable.at(
          Math.min(Math.max(index + step, 0), usable.length - 1)
        )
        if (next === undefined || next.key === viewed) {
          return
        }
        event.currentTarget.focus()
        view(next.key)
      }}
    >
      {props.choices.length > 1 && (
        <div className="bg-muted/30 flex w-11 shrink-0 [scrollbar-width:none] flex-col gap-1 overflow-y-auto p-1">
          {props.choices.map((item) => (
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
                    view(item.key)
                  }}
                >
                  <ProviderIcon provider={item.provider} className="size-5" />
                  {props.choices.filter(
                    (other) => other.provider === item.provider
                  ).length > 1 && (
                    <span
                      className={cn(
                        'text-3xs pointer-events-none absolute right-0.5 bottom-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border px-0.5 leading-none font-semibold shadow-sm',
                        item.color === null
                          ? 'bg-card text-muted-foreground'
                          : 'border-card text-white'
                      )}
                      style={
                        item.color === null
                          ? undefined
                          : { backgroundColor: item.color }
                      }
                    >
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
                props.onClose()
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
          props.choices.length > 1 && 'border-border/70 border-l'
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
                  props.onClose()
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
                data-model
                data-selected={
                  viewed === current && option.value === settings.model
                }
                className={cn(
                  'hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground mb-0.5 outline-none flex min-h-8 w-full cursor-pointer flex-col justify-center rounded-sm px-2 py-1.5 text-left',
                  viewed === current &&
                    option.value === settings.model &&
                    'text-foreground bg-foreground/[0.08]'
                )}
                onClick={() => {
                  if (viewed === null) {
                    return
                  }
                  pick(viewed, option)
                  props.onClose()
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
    </div>
  )
}

function focusModel(container: HTMLElement) {
  const target =
    container.querySelector<HTMLElement>('input') ??
    container.querySelector<HTMLElement>('[data-selected=true]') ??
    container.querySelector<HTMLElement>('[data-model]')
  target?.focus()
}
