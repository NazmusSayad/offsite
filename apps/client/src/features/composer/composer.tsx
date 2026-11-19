import { PaperclipIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { GitRepo } from '@offsite/core/git'
import { NO_PROJECT } from '@offsite/core/projects'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Wrapper } from '@/components/wrapper'
import {
  isSideQuest,
  sendSideQuestDraft,
  sideQuestCommands,
} from '@/features/side-quests/ask'
import { selectedPrompts, startingThread } from '@/lib/outbox'
import { interrupt } from '@/lib/sessions'
import {
  draftKey,
  getState,
  machineOf,
  placePathOf,
  setDraft,
  showError,
  selectedRunning,
  useStore,
} from '@/lib/store'
import { cn, mod, touch } from '@/lib/utils'
import { attachFiles, attachPasted } from './attach'
import { isPasteInline, lastUserText, restoredDraft } from './attached-images'
import {
  ComposerInput,
  focusComposer,
  moveComposerCaret,
} from './composer-input'
import { ComposerMenu, useProjectFiles, useSuggestions } from './composer-menu'
import { useDictation } from './dictation'
import { editDraft, fileMarker, getDraft, useDraft } from './drafts'
import { MissingWorktreeNotice } from './missing-worktree-notice'
import { isSnoozeShortcut, MoreMenu, sendStatus } from './more-menu'
import { PermissionPrompt } from './permission-prompt'
import { Pickers } from './pickers'
import { ProjectHeading } from './project-heading'
import { UsageResetBanner, QueuedMessages } from './queue'
import { applyRewind, RewindNotice } from './rewind'
import { sendDraft } from './send'
import { DictateButton, SendControls } from './send-controls'
import { isStashShortcut, toggleStash } from './stash'
import { WorktreeBar } from './worktree-bar'

export function Composer(props: {
  repos: GitRepo[]
  onRefreshGit: () => void
}) {
  const selection = useStore((state) => state.selection)
  const loaded = useStore((state) => state.loaded)
  const blank = useStore(
    (state) => state.items.length === 0 && state.partial === ''
  )
  const requests = useStore((state) => state.requests)
  const shown = useStore((state) =>
    selectedPrompts(state).some((item) => item.status !== 'queued')
  )
  const starting = useStore(startingThread)
  const draft = useStore((state) => state.draft)
  const capabilities = useStore((state) => state.capabilities)
  const provider = useStore((state) => state.settings.provider)
  const noAccount = useStore((state) =>
    state.settings.provider === 'opencode'
      ? state.machines.find(
          (machine) => machine.id === state.selection?.machine
        )?.openCode.available !== true
      : state.settings.accountId === null
  )
  const [sending, setSending] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const pasteInline = useRef(false)
  const machine = selection?.machine ?? ''
  const projectId = selection?.projectId ?? ''
  const worktreeId = selection?.worktreeId ?? null
  const folder = useStore((state) =>
    placePathOf(state, machine, projectId, worktreeId)
  )
  const delivery = useStore(
    (state) => machineOf(state, machine).config?.delivery ?? null
  )
  const key = selection === null ? '' : draftKey(selection)
  const stored = useDraft(key)
  const text = stored.text
  const images = stored.images
  const attachedFiles = stored.files
  const markers = useMemo(
    () => [
      ...images.map((image) => `[Image #${image.number}]`),
      ...attachedFiles.map(fileMarker),
    ],
    [images, attachedFiles]
  )
  const files = useProjectFiles(machine, projectId, worktreeId)
  const knownFiles = useMemo(() => new Set(files), [files])
  const [caret, setCaret] = useState(text.length)
  const running = useStore(selectedRunning)
  const hero = loaded && blank && !running && !shown
  const request = requests.at(0)
  const dictation = useDictation(key, true)
  const suggestions = useSuggestions({
    draft: key,
    text,
    caret,
    commands: [
      ...sideQuestCommands(provider),
      ...(capabilities?.commands ?? []),
    ],
    files,
  })

  useEffect(() => {
    if (touch.matches) {
      return
    }
    moveComposerCaret(key, getDraft(key).text.length, true)
  }, [selection, key])

  useEffect(() => {
    if (draft === null) {
      return
    }
    const restored = restoredDraft(draft)
    editDraft(key, (current) => ({ ...current, ...restored }))
    setCaret(restored.text.length)
    setDraft(null)
    focusComposer(key)
  }, [draft, key])

  const newThread =
    selection !== null &&
    selection.sessionId === null &&
    selection.pending === null
  const loading = newThread && (sending || starting)
  const empty =
    text.trim() === '' ||
    sending ||
    noAccount ||
    (starting && selection?.sessionId === null) ||
    (selection !== null && selection.pending !== null)

  function edit(value: string, position: number) {
    editDraft(key, (current) => ({ ...current, text: value }))
    setCaret(position)
    suggestions.reset()
  }

  async function submit(swap: boolean, flipSnooze: boolean) {
    if (empty) {
      return
    }
    setSending(true)
    try {
      if (isSideQuest(text)) {
        await sendSideQuestDraft(key)
        setCaret(0)
        return
      }
      if (delivery === null) {
        throw new Error('This machine is not connected')
      }
      const rewinding = getState().rewinding
      if (rewinding !== null) {
        await applyRewind(rewinding)
      }
      await sendDraft(
        key,
        swap ? (delivery === 'queue' ? 'steer' : 'queue') : delivery,
        sendStatus(flipSnooze)
      )
      setCaret(0)
    } catch (error) {
      showError(error)
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className={cn(
        'pointer-events-none z-20',
        hero
          ? 'absolute inset-0 flex items-center pb-3 sm:pb-4'
          : 'relative flex min-h-0 flex-col before:absolute before:right-(--app-scrollbar-width) before:bottom-full before:left-0 before:h-8 before:bg-linear-to-t before:from-background before:to-transparent'
      )}
    >
      <Wrapper width="composer" className="pointer-events-auto relative z-10">
        {hero && (
          <ProjectHeading
            machine={machine}
            projectId={projectId}
            onCloseMenu={() => focusComposer(key)}
          />
        )}
        <UsageResetBanner />
        <MissingWorktreeNotice running={running} />
        <RewindNotice draftKey={key} />
        <QueuedMessages />
        {request !== undefined && (
          <PermissionPrompt
            key={request.id}
            request={request}
            machine={machine}
            cwd={folder ?? ''}
            count={requests.length}
            draft={text}
          />
        )}
        <ComposerMenu suggestions={suggestions} />
        <div
          className={cn(
            'composer-glass shadow-composer relative z-10 border border-(--composer-outline) transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-[color-mix(in_srgb,var(--text)_16%,transparent)] focus-within:ring-4 focus-within:ring-[color-mix(in_srgb,var(--text)_4%,transparent)] dark:shadow-none',
            hero ? 'rounded-3xl' : 'rounded-t-3xl border-b-0',
            request?.kind === 'question' && 'hidden'
          )}
          onMouseDown={(event) => {
            if (!(event.target instanceof Element)) {
              return
            }
            if (event.target.closest('input, textarea, [contenteditable]')) {
              return
            }
            if (
              event.currentTarget.contains(event.target) &&
              event.target.closest('button, a') === null
            ) {
              event.preventDefault()
              focusComposer(key)
              return
            }
            if (touch.matches) {
              event.preventDefault()
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            void attachFiles(
              key,
              [...event.dataTransfer.files],
              caret,
              setCaret
            )
          }}
        >
          <div className="pb-1 md:pb-2">
            <ComposerInput
              main
              label={null}
              text={text}
              editable={!loading}
              newThread={hero}
              markers={markers}
              files={knownFiles}
              draft={key}
              onEdit={edit}
              onCaret={setCaret}
              onPaste={(event) => {
                const inline = pasteInline.current
                pasteInline.current = false
                return attachPasted(event, key, inline, caret, setCaret)
              }}
              onKeyDown={(event) => {
                pasteInline.current = isPasteInline(event)
                if (isStashShortcut(event)) {
                  toggleStash(key)
                  return true
                }
                if (suggestions.onKeyDown(event)) {
                  return true
                }
                if (
                  event.key === 'Enter' &&
                  (!event.shiftKey || isSnoozeShortcut(event)) &&
                  !touch.matches
                ) {
                  const flipSnooze = isSnoozeShortcut(event)
                  void submit(
                    !flipSnooze && (event.metaKey || event.ctrlKey),
                    flipSnooze
                  )
                  return true
                }
                if (event.key === 'ArrowUp' && text === '') {
                  const last = lastUserText(getState().items)
                  if (last === null) {
                    return false
                  }
                  edit(last, last.length)
                  return true
                }
                if (event.key === 'Escape' && running) {
                  interrupt()
                }
                return false
              }}
              placeholder={
                noAccount
                  ? 'Add an account in Settings to start'
                  : running && delivery === 'steer'
                    ? `Steer the agent… (${mod}+Enter to queue)`
                    : running
                      ? `Queue a follow-up… (${mod}+Enter to send now)`
                      : 'Ask anything, @tag files/folders, or / for commands'
              }
            />
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center justify-between gap-2 ps-2 pe-1.5 sm:px-3.5 md:pe-3.25',
              hero ? 'pb-2 sm:pb-3.5' : 'pb-1.5 sm:pb-3'
            )}
          >
            <div className="-m-1 -ms-3.5 flex min-w-0 flex-1 [scrollbar-width:none] items-center overflow-x-auto p-1 ps-2.25 sm:ps-4 md:gap-1">
              <Pickers />
            </div>
            <div className="relative flex shrink-0 items-center justify-end gap-1 sm:gap-1.5 md:gap-2.5">
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                onChange={(event) => {
                  void attachFiles(
                    key,
                    [...(event.target.files ?? [])],
                    caret,
                    setCaret
                  )
                  event.target.value = ''
                }}
              />
              <div className="flex items-center gap-0.5 sm:gap-1 md:gap-2">
                {sending && attachedFiles.length > 0 && (
                  <span className="text-muted-foreground text-xs">
                    Uploading…
                  </span>
                )}
                <MoreMenu
                  dictation={dictation}
                  empty={empty}
                  delivery={delivery}
                  onSubmit={() => void submit(true, false)}
                  onFlipSnooze={() => void submit(false, true)}
                />
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="relative after:absolute after:-inset-x-0.75 after:-inset-y-1.5 md:size-8 md:after:hidden"
                  title="Attach files"
                  aria-label="Attach files"
                  onClick={() => picker.current?.click()}
                >
                  <HugeiconsIcon
                    icon={PaperclipIcon}
                    className="size-3.5 md:size-4"
                  />
                </Button>
                <DictateButton dictation={dictation} desktop={false} />
              </div>
              <SendControls
                dictation={dictation}
                running={running}
                empty={empty}
                loading={loading}
                delivery={delivery}
                onSubmit={(swap) => void submit(swap, false)}
                onStop={interrupt}
              />
            </div>
          </div>
        </div>
        {hero && selection?.sessionId === null && projectId !== NO_PROJECT && (
          <WorktreeBar
            key={key}
            machine={machine}
            projectId={projectId}
            worktreeId={worktreeId}
            sessionId={selection?.sessionId ?? null}
            repos={props.repos}
            onRefresh={props.onRefreshGit}
          />
        )}
      </Wrapper>
    </div>
  )
}
