import type { Item } from '@offsite/core/items'
import type { SideQuest } from '@offsite/core/side-quests'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { call, listen } from '@/api/connection'
import { Markdown } from '@/components/markdown/markdown'
import { MediaMessage } from '@/components/markdown/markdown-media'
import { Shimmer } from '@/features/transcript/tool-row'
import {
  MessageCopyButton,
  UserMessage,
} from '@/features/transcript/user-message'
import { PanelCloseButton } from '@/features/workspace/panel-close-button'
import { clock } from '@/lib/format'
import { machineOf, type Selection, showError, useStore } from '@/lib/store'
import { randomId } from '@/lib/utils'
import { questStarts, useSideQuestPick } from './ask'
import { SideQuestComposer } from './side-quest-composer'
import { SideQuestMenu } from './side-quest-menu'

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
  const pick = useSideQuestPick(machine, sessionId)
  const fresh = useState(randomId)[0]
  const list = useRef<HTMLDivElement>(null)
  const last = quests?.at(-1)
  const questId = pick ?? questStarts(quests ?? []).at(-1)?.questId ?? fresh
  const shown = quests?.filter((quest) => quest.questId === questId) ?? []
  const start = shown.at(0)
  const shownStatus = shown.at(-1)?.status

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
  }, [questId, shown.length, shownStatus])

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 border-b pr-3 pl-3">
        <PanelCloseButton mobile={props.mobile} onClick={props.onClose} />
        <span className="text-foreground shrink-0 text-xs font-medium">
          Side Quests
        </span>
        {sessionId !== null && quests !== null && quests.length > 0 && (
          <SideQuestMenu
            machine={machine}
            sessionId={sessionId}
            quests={quests}
            questId={questId}
            start={start}
          />
        )}
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
        {start !== undefined && <SideQuestStart time={start.createdAt} />}
        <div className="flex flex-col gap-5">
          {shown.map((quest) => (
            <div key={quest.id} className="flex flex-col gap-2">
              <MediaMessage value={{ id: quest.id, reply: false }}>
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
              </MediaMessage>
              {quest.status === 'answering' && (
                <p className="text-muted-foreground px-1 text-sm">
                  <Shimmer text="Answering" active />
                </p>
              )}
              {quest.status === 'answered' && quest.answer !== null && (
                <div className="group/answer">
                  <MediaMessage
                    value={{ id: `${quest.id}:answer`, reply: true }}
                  >
                    <Markdown text={quest.answer} className="px-1 text-sm" />
                  </MediaMessage>
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
      {sessionId !== null && available && quests !== null && (
        <SideQuestComposer
          selection={props.selection}
          sessionId={sessionId}
          questId={questId}
          lastQuestion={last?.question ?? null}
        />
      )}
    </div>
  )
}

function SideQuestStart(props: { time: number }) {
  const message = useStore(
    (state) =>
      [...state.earlier, ...state.items]
        .filter((item) => startedFrom(item, props.time))
        .at(-1) ?? null
  )
  if (message === null) {
    return (
      <p className="text-muted-foreground mb-5 px-1 text-xs">
        Started from a message before {clock(props.time)}
      </p>
    )
  }
  if (message.kind !== 'user' && message.kind !== 'assistant') {
    throw new Error('A side quest can start only from a message')
  }
  return (
    <div className="border-border text-muted-foreground mb-5 border-l-2 pl-3 text-xs">
      <p className="text-foreground/80 font-medium">
        {message.kind === 'user'
          ? 'Started from your message'
          : 'Started from the reply'}
      </p>
      <p className="mt-1 line-clamp-2 break-words whitespace-pre-wrap">
        {message.text}
      </p>
    </div>
  )
}

function startedFrom(item: Item, time: number) {
  return (
    (item.kind === 'user' || item.kind === 'assistant') &&
    item.time !== null &&
    item.time <= time
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
