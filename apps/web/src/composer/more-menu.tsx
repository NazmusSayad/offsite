import {
  ChartRingIcon,
  FilePenIcon,
  FoldVerticalIcon,
  ListTodoIcon,
  MoreHorizontalIcon,
  PaperclipIcon,
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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { compact } from '@/lib/format'
import { cn } from '@/lib/utils'
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

export function MoreMenu(props: { onAttach: () => void }) {
  const permissionMode = useStore((state) => state.settings.permissionMode)
  const context = useStore((state) => state.context)
  const mode = modes.find((item) => item.value === permissionMode)
  const percent =
    context === null || context.window === null
      ? null
      : Math.max(0, Math.min(100, (context.tokens / context.window) * 100))

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
        <DropdownMenuItem onSelect={props.onAttach}>
          <HugeiconsIcon icon={PaperclipIcon} />
          Attach files
        </DropdownMenuItem>
        {context !== null && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon icon={ChartRingIcon} />
                <span className="flex-1">Context usage</span>
                <DropdownMenuShortcut
                  className={cn(
                    'tracking-normal tabular-nums',
                    percent !== null && percent > 90 && 'text-error'
                  )}
                >
                  {percent === null
                    ? compact(context.tokens)
                    : `${Math.round(percent)}%`}
                </DropdownMenuShortcut>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="max-h-(--radix-dropdown-menu-content-available-height) w-72 overflow-y-auto">
                  <DropdownMenuLabel className="text-foreground flex justify-between">
                    <span>Context window</span>
                    <span className="tabular-nums">
                      {context.window === null
                        ? `${compact(context.tokens)} tokens`
                        : `${compact(context.tokens)} / ${compact(context.window)} · ${Math.round(percent ?? 0)}%`}
                    </span>
                  </DropdownMenuLabel>
                  {context.model !== null && (
                    <div className="text-muted-foreground -mt-1 px-2 pb-1 text-xs">
                      {context.model}
                    </div>
                  )}
                  {context.categories.length > 0 && <DropdownMenuSeparator />}
                  {context.categories.map((category) => (
                    <div
                      key={category.name}
                      className={`flex justify-between px-2 py-1 text-xs ${category.kind === 'used' ? '' : 'text-muted-foreground'}`}
                    >
                      <span>{category.name}</span>
                      <span className="tabular-nums">
                        {compact(category.tokens)}
                        {context.window !== null &&
                          ` · ${((category.tokens / context.window) * 100).toFixed(1)}%`}
                      </span>
                    </div>
                  ))}
                  {context.sections.map((section) => (
                    <div key={section.title}>
                      <DropdownMenuSeparator />
                      <DropdownMenuLabel>{section.title}</DropdownMenuLabel>
                      {section.items.map((item) => (
                        <div
                          key={item.name}
                          className="flex justify-between gap-3 px-2 py-1 text-xs"
                        >
                          <span className="truncate" title={item.name}>
                            {item.name}
                          </span>
                          <span className="text-muted-foreground shrink-0 tabular-nums">
                            {compact(item.tokens)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuItem
              onSelect={() =>
                sendPrompt({ text: '/compact', images: [] }, 'queue').catch(
                  showError
                )
              }
            >
              <HugeiconsIcon icon={FoldVerticalIcon} />
              Compact conversation
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
