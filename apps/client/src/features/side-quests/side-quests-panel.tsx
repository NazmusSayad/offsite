import { SendHorizontalIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SideQuest } from '@offsite/core/side-quests'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { call, listen } from '@/api/connection'
import { Markdown } from '@/components/markdown/markdown'
import { PanelCloseButton } from '@/features/workspace/panel-close-button'
import { machineOf, type Selection, showError, useStore } from '@/lib/store'
import { askSideQuest } from './ask'

export function SideQuestsPanel(props: {
  selection: Selection
  onClose: () => void
  mobile: boolean
}) {
  const machine = props.selection.machine
  const sessionId = props.selection.sessionId
  const status = useStore((state) => machineOf(state, machine).status)
  const available = useStore((state) => state.settings.provider !== 'opencode')
  const [quests, setQuests] = useState<SideQuest[] | null>(null)
  const [text, setText] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const last = quests?.at(-1)

  useEffect(() => {
    if (sessionId === null || status !== 'online') {
      return
    }
    const stop = listen({
      event: (from, event) => {
        if (
          from === machine &&
          event.type === 'sideQuests' &&
          event.sessionId === sessionId
        ) {
          setQuests(event.sideQuests)
        }
      },
    })
    void load(machine, sessionId, setQuests)
    return stop
  }, [machine, sessionId, status])

  useLayoutEffect(() => {
    if (list.current !== null) {
      list.current.scrollTop = list.current.scrollHeight
    }
  }, [quests?.length, last?.status])

  async function ask() {
    const question = text.trim()
    if (sessionId === null || question === '') {
      return
    }
    setText('')
    try {
      await askSideQuest(props.selection, sessionId, {
        text: question,
        images: [],
      })
    } catch (error) {
      setText(question)
      showError(error)
    }
  }

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 border-b pr-3 pl-3">
        <PanelCloseButton mobile={props.mobile} onClick={props.onClose} />
        <span className="text-foreground min-w-0 truncate text-xs font-medium">
          Side Quests
        </span>
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {sessionId === null && (
          <p className="text-muted-foreground px-1 text-xs">
            Side quests start once this thread has its first message.
          </p>
        )}
        {sessionId !== null && !available && (
          <p className="text-muted-foreground px-1 text-xs">
            Side quests work only in Claude and Codex threads.
          </p>
        )}
        {available && quests !== null && quests.length === 0 && (
          <p className="text-muted-foreground px-1 text-xs">
            No side quests in this thread.
          </p>
        )}
        <div className="flex flex-col gap-5">
          {quests?.map((quest) => (
            <div key={quest.id} className="flex flex-col gap-2">
              <div className="bg-message text-message-foreground max-w-[85%] self-end rounded-2xl px-3 py-2 text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
                {quest.question}
              </div>
              {quest.status === 'answering' && (
                <p className="text-muted-foreground text-shimmer px-1 text-sm">
                  Answering
                </p>
              )}
              {quest.status === 'answered' && quest.answer !== null && (
                <Markdown text={quest.answer} className="px-1 text-sm" />
              )}
              {quest.status === 'failed' && (
                <p className="text-destructive px-1 text-sm">{quest.error}</p>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 p-3 pt-0">
        <div className="bg-input/40 border-input focus-within:border-primary flex items-end gap-1 rounded-2xl border p-1.5">
          <textarea
            rows={2}
            aria-label="Side question"
            placeholder="Ask a side question"
            value={text}
            disabled={sessionId === null || !available}
            className="placeholder:text-muted-foreground [field-sizing:content] max-h-40 min-h-0 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none disabled:cursor-not-allowed"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault()
                void ask()
              }
            }}
          />
          <button
            className="bg-composer-send text-composer-send-foreground hover:bg-composer-send-hover disabled:bg-foreground/12 disabled:text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full transition-colors enabled:cursor-pointer disabled:pointer-events-none"
            title="Send (Enter)"
            aria-label="Send side question"
            disabled={sessionId === null || !available || text.trim() === ''}
            onClick={() => void ask()}
          >
            <HugeiconsIcon
              icon={SendHorizontalIcon}
              className="size-4 translate-x-[0.5px]"
              strokeWidth={1.5}
            />
          </button>
        </div>
      </div>
    </div>
  )
}

async function load(
  machine: string,
  sessionId: string,
  onLoad: (quests: SideQuest[]) => void
) {
  try {
    onLoad(await call(machine, 'sideQuests.list', { sessionId }))
  } catch (error) {
    showError(error)
  }
}
