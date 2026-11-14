import {
  ArchiveArrowDownIcon,
  Archive02Icon,
  Cancel01Icon,
  ChartRingIcon,
  FilePenIcon,
  ListTodoIcon,
  AiMicIcon,
  MoreHorizontalIcon,
  SunriseIcon,
  Queue01Icon,
  SentIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  SparklesIcon,
  ZzzIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import type { PromptDelivery } from '@offsite/core/config'
import type { Capabilities, Provider } from '@offsite/core/providers'
import { useState } from 'react'
import { MoreLabel } from '@/components/icons'
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
import { compact, timeAgo } from '@/lib/format'
import { sendPrompt } from '@/lib/sessions'
import {
  draftKey,
  getState,
  showError,
  type State,
  useStore,
} from '@/lib/store'
import { mod, splitAtLimit, touch } from '@/lib/utils'
import type { Dictation } from './dictation'
import { deleteStash, hasPrompt, useDraft, useStash } from './drafts'
import { keepFocusOnTouch, refocusComposer } from './picker'
import { restorePrompt, stashPrompt } from './stash'

export const fixedModes: Record<
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

export function isSnoozeShortcut(event: KeyboardEvent) {
  return (
    event.key === 'Enter' &&
    (event.metaKey || event.ctrlKey) &&
    (event.shiftKey || event.altKey)
  )
}

function snoozesOnSend(state: State) {
  const selection = state.selection
  const session =
    selection === null || selection.sessionId === null
      ? undefined
      : state.sessions.find(
          (item) =>
            item.machine === selection.machine &&
            item.id === selection.sessionId
        )
  return state.prefs.autoMoveToSnooze || session?.status === 'snoozed'
}

export function sendStatus(flipSnooze: boolean) {
  const state = getState()
  if (flipSnooze) {
    return snoozesOnSend(state) ? 'active' : 'snoozed'
  }
  return state.prefs.autoMoveToSnooze ? 'snoozed' : null
}

export function MoreMenu(props: {
  dictation: Dictation
  empty: boolean
  delivery: PromptDelivery | null
  onSubmit: () => void
  onFlipSnooze: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={!touch.matches}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="relative after:absolute after:-inset-x-0.75 after:-inset-y-1.5 md:size-8 md:after:hidden"
          title="More"
          aria-label="More composer controls"
        >
          <HugeiconsIcon
            icon={MoreHorizontalIcon}
            className="size-3.5 md:size-4"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-64"
        side="top"
        align="end"
        onOpenAutoFocus={keepFocusOnTouch}
        onCloseAutoFocus={refocusComposer}
      >
        <MoreMenuContent
          dictation={props.dictation}
          empty={props.empty}
          delivery={props.delivery}
          onSubmit={props.onSubmit}
          onFlipSnooze={props.onFlipSnooze}
          onClose={() => setOpen(false)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MoreMenuContent(props: {
  dictation: Dictation
  empty: boolean
  delivery: PromptDelivery | null
  onSubmit: () => void
  onFlipSnooze: () => void
  onClose: () => void
}) {
  const settings = useStore((state) => state.settings)
  const snoozes = useStore(snoozesOnSend)
  const context = useStore((state) => state.context)
  const capabilities = useStore((state) => state.capabilities)
  const modes = providerModes(settings.provider, capabilities)
  const mode = modes.find((item) => item.value === settings.mode)
  const modeList = splitAtLimit(modes, 5, (item) => item === mode)
  const title = settings.provider === 'opencode' ? 'Agent' : 'Permission mode'
  const stash = useStash()
  const key = useStore((state) =>
    state.selection === null ? '' : draftKey(state.selection)
  )
  const draft = useDraft(key)
  const [submenu, setSubmenu] = useState<'mode' | 'stash' | null>(null)

  function modeItem(item: (typeof modes)[number]) {
    return (
      <DropdownMenuRadioItem
        key={item.value}
        value={item.value}
        onSelect={() => changeSettings({ mode: item.value })}
      >
        <HugeiconsIcon icon={item.icon} />
        {item.label}
      </DropdownMenuRadioItem>
    )
  }

  function stashItem(item: (typeof stash)[number]) {
    const attachments = item.images.length + item.files.length
    const firstLine = item.text.trim().split('\n')[0]
    return (
      <DropdownMenuItem
        key={item.id}
        className="items-start"
        onSelect={() => restorePrompt(key, item.id)}
        onKeyDown={(event) => {
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault()
            deleteStash(item.id)
          }
        }}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate">
            {firstLine === '' ? 'Attachments' : firstLine}
          </span>
          <span className="text-muted-foreground block text-xs">
            {timeAgo(item.createdAt)}
            {attachments > 0 &&
              ` · ${attachments} attachment${attachments === 1 ? '' : 's'}`}
          </span>
        </span>
        <Button
          variant="ghost-muted"
          size="icon-micro"
          aria-label="Delete stashed prompt"
          title="Delete"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            deleteStash(item.id)
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </DropdownMenuItem>
    )
  }

  return (
    <>
      <DropdownMenuSub
        open={submenu === 'mode'}
        onOpenChange={(next) => setSubmenu(next ? 'mode' : null)}
      >
        <DropdownMenuSubTrigger
          onClick={(event) => {
            if (touch.matches) {
              event.preventDefault()
              setSubmenu('mode')
            }
          }}
        >
          <HugeiconsIcon icon={mode?.icon ?? ShieldCheckIcon} />
          <span className="min-w-0 flex-1 truncate">
            {mode?.label ?? 'Default'}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuLabel>{title}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={settings.mode ?? ''}>
              {modeList.shown.map(modeItem)}
              {modeList.more.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <MoreLabel
                      text={`${modeList.more.length} more agents`}
                      className="size-4"
                    />
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
                      {modeList.more.map(modeItem)}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
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
            onClick={() => {
              props.onClose()
              sendPrompt(
                crypto.randomUUID(),
                { text: '/compact', images: [] },
                'queue',
                getState().selection,
                null
              ).catch(showError)
            }}
          >
            Compact
          </Button>
        </div>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={props.dictation.state.kind === 'transcribing'}
        onSelect={() => void props.dictation.toggle()}
      >
        <HugeiconsIcon icon={AiMicIcon} />
        <span className="flex-1">
          {props.dictation.state.kind === 'recording'
            ? 'Finish dictation'
            : 'Dictate'}
        </span>
        <span className="text-muted-foreground text-xs">{mod}+Shift+D</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!hasPrompt(draft)}
        onSelect={() => stashPrompt(key)}
      >
        <HugeiconsIcon icon={ArchiveArrowDownIcon} />
        <span className="flex-1">Stash prompt</span>
        <span className="text-muted-foreground text-xs">{mod}+S</span>
      </DropdownMenuItem>
      {stash.length > 0 && (
        <DropdownMenuSub
          open={submenu === 'stash'}
          onOpenChange={(next) => setSubmenu(next ? 'stash' : null)}
        >
          <DropdownMenuSubTrigger
            onClick={(event) => {
              if (touch.matches) {
                event.preventDefault()
                setSubmenu('stash')
              }
            }}
          >
            <HugeiconsIcon icon={Archive02Icon} />
            <span className="flex-1">Stashed prompts</span>
            <span className="text-muted-foreground text-xs tabular-nums">
              {stash.length}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto">
              {stash.slice(0, 5).map(stashItem)}
              {stash.length > 5 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <MoreLabel
                      text={`${stash.length - 5} more stashed prompts`}
                      className="size-4"
                    />
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto">
                      {stash.slice(5).map(stashItem)}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      )}
      {props.delivery !== null && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={props.empty}
            onSelect={props.onFlipSnooze}
          >
            <HugeiconsIcon icon={snoozes ? SunriseIcon : ZzzIcon} />
            <span className="flex-1">
              {snoozes ? 'Send & Unsnooze' : 'Send & Snooze'}
            </span>
            <span className="text-muted-foreground text-xs">
              {mod}+Shift+Enter
            </span>
          </DropdownMenuItem>
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
    </>
  )
}
