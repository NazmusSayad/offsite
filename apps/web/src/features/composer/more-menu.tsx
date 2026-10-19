import {
  ChartRingIcon,
  FilePenIcon,
  ListTodoIcon,
  MoreHorizontalIcon,
  Queue01Icon,
  SentIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { PromptDelivery } from '@offsite/core/config'
import type { Capabilities, Provider } from '@offsite/core/providers'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { changeSettings } from '@/lib/accounts'
import { compact } from '@/lib/format'
import { sendPrompt } from '@/lib/sessions'
import { showError, useStore } from '@/lib/store'
import { mod } from '@/lib/utils'

const fixedModes: Record<
  Exclude<Provider, 'opencode'>,
  { value: string; label: string; icon: IconSvgElement }[]
> = {
  claude: [
    { value: 'default', label: 'Ask before edits', icon: ShieldCheckIcon },
    { value: 'acceptEdits', label: 'Accept edits', icon: FilePenIcon },
    { value: 'plan', label: 'Plan mode', icon: ListTodoIcon },
    { value: 'auto', label: 'Auto mode', icon: SparklesIcon },
    {
      value: 'bypassPermissions',
      label: 'Bypass permissions',
      icon: ShieldOffIcon,
    },
  ],
  codex: [
    { value: 'read-only', label: 'Read only', icon: ShieldCheckIcon },
    { value: 'auto', label: 'Auto', icon: FilePenIcon },
    { value: 'full-access', label: 'Full access', icon: ShieldOffIcon },
  ],
}

function providerModes(provider: Provider, capabilities: Capabilities | null) {
  if (provider !== 'opencode') {
    return fixedModes[provider]
  }
  return (capabilities?.agents ?? []).map((agent) => ({
    value: agent.id,
    label: agent.name,
    icon: agent.id === 'plan' ? ListTodoIcon : FilePenIcon,
  }))
}

export function MoreMenu(props: {
  empty: boolean
  delivery: PromptDelivery | null
  onSubmit: () => void
}) {
  const settings = useStore((state) => state.settings)
  const context = useStore((state) => state.context)
  const capabilities = useStore((state) => state.capabilities)
  const modes = providerModes(settings.provider, capabilities)
  const mode = modes.find((item) => item.value === settings.mode)
  const title = settings.provider === 'opencode' ? 'Agent' : 'Permission mode'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          title="More"
          aria-label="More composer controls"
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-56"
        side="top"
        align="end"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          document.querySelector<HTMLElement>('[data-composer]')?.focus()
        }}
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <HugeiconsIcon icon={mode?.icon ?? ShieldCheckIcon} />
            <span className="min-w-0 flex-1 truncate">
              {mode?.label ?? 'Default'}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuLabel>{title}</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={settings.mode ?? ''}>
                {modes.map((item) => (
                  <DropdownMenuRadioItem
                    key={item.value}
                    value={item.value}
                    onSelect={() => changeSettings({ mode: item.value })}
                  >
                    <HugeiconsIcon icon={item.icon} />
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        {settings.provider === 'codex' && (
          <DropdownMenuCheckboxItem
            checked={settings.plan}
            onCheckedChange={(plan) => changeSettings({ plan })}
          >
            <HugeiconsIcon icon={ListTodoIcon} />
            Plan first
          </DropdownMenuCheckboxItem>
        )}
        {context !== null && (
          <div className="flex min-h-7 items-center gap-2 px-2 py-1 text-sm [&_svg]:size-4">
            <HugeiconsIcon icon={ChartRingIcon} />
            <span className="flex-1">Context</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {compact(context.tokens)}
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={() =>
                sendPrompt({ text: '/compact', images: [] }, 'queue').catch(
                  showError
                )
              }
            >
              Compact
            </Button>
          </div>
        )}
        {props.delivery !== null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={props.empty} onSelect={props.onSubmit}>
              <HugeiconsIcon
                icon={props.delivery === 'steer' ? Queue01Icon : SentIcon}
              />
              <span className="flex-1">
                {props.delivery === 'steer' && 'Queue'}
                {props.delivery === 'queue' && 'Send now'}
              </span>
              <span className="text-muted-foreground text-xs">{mod}+Enter</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
