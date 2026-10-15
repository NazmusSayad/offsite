import {
  BrainIcon,
  ChevronDownIcon,
  FilePenIcon,
  ListTodoIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  SparklesIcon,
  UserRoundIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { EffortLevel, PermissionMode } from '@server/protocol'
import type { ReactNode } from 'react'
import { limitLabel } from '@/accounts/limits'
import { ClaudeIcon } from '@/components/icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { changeSettings, showSettingsPage, useStore } from '@/store'

type Option = { value: string; label: string; description: string | null }

export const modes: {
  value: PermissionMode
  label: string
  icon: IconSvgElement
}[] = [
  { value: 'default', label: 'Ask before edits', icon: ShieldCheckIcon },
  { value: 'acceptEdits', label: 'Accept edits', icon: FilePenIcon },
  { value: 'plan', label: 'Plan mode', icon: ListTodoIcon },
  { value: 'auto', label: 'Auto mode', icon: SparklesIcon },
  {
    value: 'bypassPermissions',
    label: 'Bypass permissions',
    icon: ShieldOffIcon,
  },
]

export const control =
  'relative inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-(--control-radius) border border-transparent outline-none hover:bg-accent data-[state=open]:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-64 [&_svg]:pointer-events-none [&_svg]:shrink-0'
export const controlSm =
  'h-7 gap-1.5 px-2.5 text-sm font-medium text-secondary-label hover:text-foreground [&_svg:not([class*=text-])]:text-muted-foreground [&_svg:not([class*=size-])]:size-4'
export const controlXs =
  'h-6 gap-1 px-1.75 text-xs font-normal text-muted-foreground/70 hover:text-foreground/80 [&_svg:not([class*=size-])]:size-3.5'

export function Pickers() {
  const settings = useStore((state) => state.settings)
  const capabilities = useStore((state) => state.capabilities)
  const models = capabilities?.models ?? []
  const modelValue = settings.model ?? 'default'
  const model = models.find((item) => item.value === modelValue)
  const mode = modes.find((item) => item.value === settings.permissionMode)
  const modeIcon = mode?.icon ?? ShieldCheckIcon

  return (
    <>
      <Picker
        title="Model"
        trigger={
          <>
            <ClaudeIcon className="size-4" />
            <span className="max-w-40 truncate">
              {model?.name ?? modelValue}
            </span>
          </>
        }
        size="sm"
        value={modelValue}
        options={models.map((item) => ({
          value: item.value,
          label: item.name,
          description: item.description,
        }))}
        onChange={(value) =>
          changeSettings({ model: value === 'default' ? null : value })
        }
        footer={null}
      />
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
          size="sm"
          value={settings.effort ?? 'default'}
          options={[
            { value: 'default', label: 'Default', description: null },
            ...model.efforts.map((effort) => ({
              value: effort,
              label: effort.charAt(0).toUpperCase() + effort.slice(1),
              description: null,
            })),
          ]}
          onChange={(value) =>
            changeSettings({
              effort: value === 'default' ? null : (value as EffortLevel),
            })
          }
          footer={null}
        />
      )}
      <Picker
        title="Permission mode (Shift+Tab)"
        trigger={
          <>
            <HugeiconsIcon icon={modeIcon} />
            <span className="hidden max-w-36 truncate sm:inline">
              {mode?.label ?? 'Mode from settings'}
            </span>
          </>
        }
        size="sm"
        value={settings.permissionMode ?? ''}
        options={modes.map((item) => ({
          value: item.value,
          label: item.label,
          description: null,
        }))}
        onChange={(value) =>
          changeSettings({ permissionMode: value as PermissionMode })
        }
        footer={null}
      />
    </>
  )
}

export function AccountPicker() {
  const settings = useStore((state) => state.settings)
  const accounts = useStore((state) => state.accounts)
  const account = accounts.find((item) => item.id === settings.accountId)

  if (settings.accountId === null) return null

  return (
    <Picker
      title="Account"
      trigger={
        <>
          <HugeiconsIcon icon={UserRoundIcon} />
          <span className="max-w-40 truncate">
            {account?.name ?? 'Account'}
          </span>
        </>
      }
      size="xs"
      value={settings.accountId}
      options={accounts.map((item) => ({
        value: item.id,
        label: item.name,
        description: [item.email, item.plan, ...item.limits.map(limitLabel)]
          .filter((part) => part !== null)
          .join(' · '),
      }))}
      onChange={(accountId) => changeSettings({ accountId })}
      footer={{
        label: 'Manage accounts…',
        onSelect: () => showSettingsPage('Accounts'),
      }}
    />
  )
}

function Picker(props: {
  title: string
  trigger: ReactNode
  size: 'sm' | 'xs'
  value: string
  options: Option[]
  onChange: (value: string) => void
  footer: { label: string; onSelect: () => void } | null
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(control, props.size === 'sm' ? controlSm : controlXs)}
          title={props.title}
        >
          {props.trigger}
          <HugeiconsIcon
            icon={ChevronDownIcon}
            strokeWidth={2.25}
            className={cn(
              props.size === 'sm'
                ? 'text-icon-muted size-3.5'
                : '-me-1 size-3 text-current opacity-50'
            )}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" side="top" align="start">
        <DropdownMenuLabel>{props.title}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={props.value}
          onValueChange={props.onChange}
        >
          {props.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <div className="flex min-w-0 flex-col">
                <span className="truncate">{option.label}</span>
                {option.description !== null && option.description !== '' && (
                  <span className="text-secondary-label truncate text-xs">
                    {option.description}
                  </span>
                )}
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {props.footer !== null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.footer.onSelect}>
              {props.footer.label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
