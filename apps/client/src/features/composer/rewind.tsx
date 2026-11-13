import {
  ArrowTurnBackwardIcon,
  PencilEdit02Icon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { startChat } from '@/lib/sessions'
import { getState, type State, update, useStore } from '@/lib/store'
import { editDraft } from './drafts'

export function RewindNotice(props: { draftKey: string }) {
  const rewinding = useStore((state) => state.rewinding)
  const sessionId = useStore((state) => state.selection?.sessionId ?? null)
  const text = useStore((state) => {
    const item = [...state.earlier, ...state.items].find(
      (candidate) => candidate.id === state.rewinding?.messageId
    )
    return item?.kind === 'user' ? item.text : null
  })

  if (rewinding === null || sessionId === null) {
    return null
  }

  return (
    <div className="composer-glass relative mx-auto -mb-[calc(1rem+1px)] flex w-[calc(100%-2.75rem)] items-center gap-2 rounded-t-2xl border border-b-0 border-(--composer-outline) ps-3 pe-1 pt-1 pb-[calc(1rem+1px+0.25rem)] text-xs/4">
      <button
        type="button"
        title="Show the message"
        className="text-secondary-label hover:text-foreground flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-start"
        onClick={() =>
          update({
            focus: {
              sessionId,
              itemId: rewinding.messageId,
              start: null,
              end: null,
            },
          })
        }
      >
        <HugeiconsIcon
          icon={PencilEdit02Icon}
          className="text-muted-foreground size-3.5 shrink-0"
        />
        <span className="shrink-0">Editing</span>
        <span className="truncate underline decoration-dotted underline-offset-2">
          {text ?? 'a message'}
        </span>
      </button>
      <span
        title={
          rewinding.mode === 'all'
            ? 'Sending undoes file changes and removes this message and everything after it.'
            : 'Sending removes this message and everything after it. Files will not change.'
        }
        className="bg-warning/10 text-warning flex h-5 shrink-0 items-center gap-1 rounded-full px-2"
      >
        <HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3" />
        {rewinding.mode === 'all' ? 'Restores code and chat' : 'Restores chat'}
      </span>
      <Button
        variant="ghost-muted"
        size="icon-micro"
        title="Cancel edit"
        onClick={() => {
          update({ rewinding: null })
          editDraft(props.draftKey, (current) => ({
            ...current,
            text: '',
            images: [],
            files: [],
          }))
        }}
      >
        <HugeiconsIcon icon={XIcon} className="size-4" />
      </Button>
    </div>
  )
}

export async function applyRewind(rewinding: NonNullable<State['rewinding']>) {
  const selection = getState().selection
  if (selection === null || selection.sessionId === null) {
    throw new Error('no session to rewind')
  }
  const replace = rewinding.first && getState().settings.provider === 'claude'
  if (rewinding.mode === 'all' || !replace) {
    await call(selection.machine, 'sessions.rewind', {
      sessionId: selection.sessionId,
      projectId: selection.projectId,
      messageId: rewinding.messageId,
      settings: getState().settings,
      code: rewinding.mode === 'all',
      conversation: !replace,
      dryRun: false,
    })
  }
  update({ rewinding: null })
  if (replace) {
    const settings = getState().settings
    startChat(selection.machine, selection.projectId, true)
    update({ settings, replacing: selection })
  }
}
