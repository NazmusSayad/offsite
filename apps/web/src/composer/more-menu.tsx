import {
  ChartRingIcon,
  FilePenIcon,
  ListTodoIcon,
  MoreHorizontalIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { PermissionMode } from '@server/protocol'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { compact } from '@/lib/format'
import { changeSettings, sendPrompt, showError, useStore } from '@/store'

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

export function MoreMenu() {
  const permissionMode = useStore((state) => state.settings.permissionMode)
  const context = useStore((state) => state.context)
  const mode = modes.find((item) => item.value === permissionMode)

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
        className="w-72"
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
            <span className="flex-1 whitespace-nowrap">Permission mode</span>
            <span className="text-muted-foreground min-w-0 truncate text-xs">
              {mode?.label ?? 'From settings'}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuLabel className="flex justify-between">
                <span>Permission mode</span>
                <span>Shift+Tab</span>
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup value={permissionMode ?? ''}>
                {modes.map((item) => (
                  <DropdownMenuRadioItem
                    key={item.value}
                    value={item.value}
                    onSelect={() =>
                      changeSettings({ permissionMode: item.value })
                    }
                  >
                    <HugeiconsIcon icon={item.icon} />
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        {context !== null && (
          <div className="flex min-h-7 items-center gap-2 px-2 py-1 text-sm [&_svg]:size-4">
            <HugeiconsIcon icon={ChartRingIcon} />
            <span className="flex-1">Context</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {context.window === null
                ? compact(context.tokens)
                : `${compact(context.tokens)} / ${compact(context.window)}`}
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
