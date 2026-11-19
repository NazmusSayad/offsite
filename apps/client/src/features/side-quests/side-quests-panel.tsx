import type { SideQuest } from '@offsite/core/side-quests'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { call, listen } from '@/api/connection'
import { Markdown } from '@/components/markdown/markdown'
import {
  MessageCopyButton,
  UserMessage,
} from '@/features/transcript/user-message'
import { PanelCloseButton } from '@/features/workspace/panel-close-button'
import { machineOf, type Selection, showError, useStore } from '@/lib/store'
import { SideQuestComposer } from './side-quest-composer'

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
              <UserMessage
                item={{
                  id: quest.id,
                  parent: null,
                  time: quest.createdAt,
                  kind: 'user',
                  text: quest.question,
                  images: quest.images,
                  format: 'text',
                }}
                first={false}
                running={false}
                rewind={false}
                bookmark={false}
              />
              {quest.status === 'answering' && (
                <p className="text-muted-foreground text-shimmer px-1 text-sm">
                  Answering
                </p>
              )}
              {quest.status === 'answered' && quest.answer !== null && (
                <div className="group/answer">
                  <Markdown text={quest.answer} className="px-1 text-sm" />
                  <div className="mt-1.5 flex items-center gap-0.5 px-1 opacity-0 transition-opacity duration-200 group-hover/answer:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                    <MessageCopyButton text={quest.answer} />
                  </div>
                </div>
              )}
              {quest.status === 'failed' && (
                <p className="text-destructive px-1 text-sm">{quest.error}</p>
              )}
            </div>
          ))}
        </div>
      </div>
      {sessionId !== null && available && (
        <SideQuestComposer
          selection={props.selection}
          sessionId={sessionId}
          lastQuestion={last?.question ?? null}
        />
      )}
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
