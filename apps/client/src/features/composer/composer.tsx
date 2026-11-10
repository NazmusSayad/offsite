import { PaperclipIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { NO_PROJECT } from '@offsite/core/projects'
import { useEffect, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { readBase64, UPLOAD_LIMIT } from '@/api/upload'
import { Button } from '@/components/ui/button'
import { Wrapper } from '@/components/wrapper'
import { logger } from '@/lib/log'
import { hasPending } from '@/lib/pending'
import { interrupt } from '@/lib/sessions'
import {
  draftKey,
  getState,
  machineOf,
  projectOf,
  setDraft,
  showError,
  selectedRunning,
  useStore,
} from '@/lib/store'
import { cn, mod, touch } from '@/lib/utils'
import {
  AttachedImages,
  isPasteInline,
  largePaste,
  lastImageNumber,
  lastUserText,
  restoredDraft,
} from './attached-images'
import { ComposerMenu, type Suggestion, suggestionsFor } from './composer-menu'
import { useDictation } from './dictation'
import {
  editDraft,
  fileMarker,
  getDraft,
  saveDraftFile,
  useDraft,
} from './drafts'
import { isSnoozeShortcut, MoreMenu, sendStatus } from './more-menu'
import { PermissionPrompt } from './permission-prompt'
import { Pickers } from './pickers'
import { ProjectHeading } from './project-heading'
import { UsageResetBanner, QueuedMessages } from './queue'
import { sendDraft } from './send'
import { DictateButton, SendControls } from './send-controls'
import { isStashShortcut, toggleStash } from './stash'
import { WorktreeBar } from './worktree-bar'

const log = logger.withTag('composer')

const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const maxImageSize = 5 * 1024 * 1024

export function Composer() {
  const selection = useStore((state) => state.selection)
  const loaded = useStore((state) => state.loaded)
  const blank = useStore(
    (state) => state.items.length === 0 && state.partial === ''
  )
  const requests = useStore((state) => state.requests)
  const waiting = useStore(hasPending)
  const draft = useStore((state) => state.draft)
  const capabilities = useStore((state) => state.capabilities)
  const noAccount = useStore((state) =>
    state.settings.provider === 'opencode'
      ? state.machines.find(
          (machine) => machine.id === state.selection?.machine
        )?.openCode.available !== true
      : state.settings.accountId === null
  )
  const [sending, setSending] = useState(false)
  const [active, setActive] = useState(0)
  const [menuClosed, setMenuClosed] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const pasteInline = useRef(false)
  const machine = selection?.machine ?? ''
  const projectId = selection?.projectId ?? ''
  const project = useStore((state) => projectOf(state, machine, projectId))
  const status = useStore((state) => machineOf(state, machine).status)
  const delivery = useStore(
    (state) => machineOf(state, machine).config?.delivery ?? null
  )
  const key = selection === null ? '' : draftKey(selection)
  const stored = useDraft(key)
  const text = stored.text
  const images = stored.images
  const attachedFiles = stored.files
  const [caret, setCaret] = useState(text.length)
  const running = useStore(selectedRunning)
  const hero = loaded && blank && !running && !waiting
  const request = requests.at(0)
  const dictation = useDictation()

  useEffect(() => {
    const element = input.current
    if (element === null || touch.matches) {
      return
    }
    element.focus()
    element.setSelectionRange(element.value.length, element.value.length)
  }, [selection])

  useEffect(() => {
    if (draft === null) {
      return
    }
    const restored = restoredDraft(draft)
    editDraft(key, (current) => ({ ...current, ...restored }))
    setCaret(restored.text.length)
    setDraft(null)
    input.current?.focus()
  }, [draft, key])

  useEffect(() => {
    if (status !== 'online') {
      return
    }
    call(machine, 'files.list', { projectId }).then(
      setFiles,
      (error: unknown) => log.error('could not list files', error)
    )
  }, [machine, projectId, status])

  const before = text.slice(0, caret)
  const trigger =
    /^\/\S*$/.exec(before)?.[0] ?? /(?:^|\s)(@\S*)$/.exec(before)?.[1] ?? null
  const suggestions =
    trigger === null || menuClosed
      ? []
      : suggestionsFor(trigger, capabilities?.commands ?? [], files)
  const activeIndex = Math.min(active, suggestions.length - 1)
  const empty =
    (text.trim() === '' && images.length === 0) ||
    sending ||
    noAccount ||
    (waiting && selection?.sessionId === null)

  function edit(value: string, position: number) {
    editDraft(key, (current) => ({
      ...current,
      text: value,
      images: current.images.filter((image) =>
        value.includes(`[Image #${image.number}]`)
      ),
      files: current.files.filter((file) => value.includes(fileMarker(file))),
    }))
    setCaret(position)
    setActive(0)
    setMenuClosed(false)
  }

  function pick(item: Suggestion) {
    if (trigger === null) {
      return
    }
    const start = caret - trigger.length
    const position = start + item.insert.length + 1
    edit(`${text.slice(0, start)}${item.insert} ${text.slice(caret)}`, position)
    requestAnimationFrame(() =>
      input.current?.setSelectionRange(position, position)
    )
  }

  async function submit(swap: boolean, flipSnooze: boolean) {
    if (empty) {
      return
    }
    setSending(true)
    try {
      if (delivery === null) {
        throw new Error('This machine is not connected')
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

  async function attach(list: File[]) {
    let position = caret
    let space = /(^|\s)$/.test(text.slice(0, caret)) ? '' : ' '
    for (const file of list) {
      if (imageTypes.includes(file.type) && file.size <= maxImageSize) {
        const data = await readBase64(file)
        const number =
          lastImageNumber(getState().items, [getDraft(key).text]) + 1
        const image = { number, mediaType: file.type, data }
        const at = position
        const marker = `${space}[Image #${number}] `
        space = ''
        editDraft(key, (current) => ({
          ...current,
          text: `${current.text.slice(0, at)}${marker}${current.text.slice(at)}`,
          images: [...current.images, image],
        }))
        position += marker.length
        setCaret(position)
        requestAnimationFrame(() =>
          input.current?.setSelectionRange(position, position)
        )
        continue
      }
      if (file.size > UPLOAD_LIMIT) {
        showError(new Error(`${file.name} is larger than 50 MB`))
        continue
      }
      const id = await saveDraftFile(file)
      const number =
        Math.max(0, ...getDraft(key).files.map((item) => item.number)) + 1
      const attached = { number, id, name: file.name }
      const at = position
      const marker = `${space}${fileMarker(attached)} `
      space = ''
      editDraft(key, (current) => ({
        ...current,
        text: `${current.text.slice(0, at)}${marker}${current.text.slice(at)}`,
        files: [...current.files, attached],
      }))
      position += marker.length
      setCaret(position)
      requestAnimationFrame(() =>
        input.current?.setSelectionRange(position, position)
      )
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
            onCloseMenu={() => input.current?.focus()}
          />
        )}
        {suggestions.length === 0 && <UsageResetBanner />}
        {suggestions.length === 0 && <QueuedMessages />}
        {request !== undefined && suggestions.length === 0 && (
          <PermissionPrompt
            key={request.id}
            request={request}
            machine={machine}
            cwd={project?.path ?? ''}
            count={requests.length}
            draft={text}
          />
        )}
        {suggestions.length > 0 && (
          <ComposerMenu
            items={suggestions}
            active={activeIndex}
            onHover={setActive}
            onPick={pick}
          />
        )}
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
            if (event.target.closest('input, textarea')) {
              return
            }
            if (
              event.currentTarget.contains(event.target) &&
              event.target.closest('button, a') === null
            ) {
              event.preventDefault()
              input.current?.focus()
              return
            }
            if (touch.matches) {
              event.preventDefault()
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            void attach([...event.dataTransfer.files])
          }}
        >
          <div
            className={cn(
              'pb-1 md:pb-2',
              images.length > 0 && 'pt-2 sm:pt-4 md:pt-3.5'
            )}
          >
            {images.length > 0 && <AttachedImages draftKey={key} />}
            <textarea
              ref={input}
              data-composer
              rows={1}
              spellCheck={false}
              autoCorrect="off"
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              data-lt-active="false"
              value={text}
              onChange={(event) =>
                edit(event.target.value, event.target.selectionStart)
              }
              onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
              onPaste={(event) => {
                const text = event.clipboardData.getData('text/plain')
                const inline = pasteInline.current
                pasteInline.current = false
                if (text !== '') {
                  event.preventDefault()
                  const file = inline ? null : largePaste(text, attachedFiles)
                  if (file !== null) {
                    void attach([file])
                    return
                  }
                  document.execCommand('insertText', false, text)
                  return
                }
                const pasted = [...event.clipboardData.files]
                if (pasted.length === 0) {
                  return
                }
                event.preventDefault()
                void attach(pasted)
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) {
                  return
                }
                pasteInline.current = isPasteInline(event.nativeEvent)
                if (isStashShortcut(event.nativeEvent)) {
                  event.preventDefault()
                  toggleStash(key)
                  return
                }
                if (suggestions.length > 0) {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault()
                    const step = event.key === 'ArrowDown' ? 1 : -1
                    setActive(
                      (activeIndex + step + suggestions.length) %
                        suggestions.length
                    )
                    return
                  }
                  if (
                    (event.key === 'Enter' && !event.shiftKey) ||
                    event.key === 'Tab'
                  ) {
                    event.preventDefault()
                    pick(suggestions[activeIndex])
                    return
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    setMenuClosed(true)
                    return
                  }
                }
                if (
                  event.key === 'Enter' &&
                  (!event.shiftKey || isSnoozeShortcut(event.nativeEvent)) &&
                  !touch.matches
                ) {
                  event.preventDefault()
                  const flipSnooze = isSnoozeShortcut(event.nativeEvent)
                  void submit(
                    !flipSnooze && (event.metaKey || event.ctrlKey),
                    flipSnooze
                  )
                  return
                }
                if (event.key === 'ArrowUp' && text === '') {
                  const last = lastUserText(getState().items)
                  if (last === null) {
                    return
                  }
                  event.preventDefault()
                  edit(last, last.length)
                  return
                }
                if (event.key === 'Escape' && running) {
                  interrupt()
                }
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
              className={cn(
                'placeholder:text-placeholder/75 block [field-sizing:content] w-full resize-none bg-transparent px-2.5 text-sm leading-relaxed outline-none sm:px-4',
                images.length > 0
                  ? 'max-h-52 min-h-19.5'
                  : 'max-h-55.5 min-h-20 pt-2 sm:max-h-56 sm:pt-4 md:pt-3.5 [@media(min-height:840px)]:min-h-23 sm:[@media(min-height:840px)]:min-h-23.5'
              )}
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
                  void attach([...(event.target.files ?? [])])
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
                <DictateButton dictation={dictation} />
              </div>
              <SendControls
                dictation={dictation}
                running={running}
                empty={empty}
                delivery={delivery}
                onSubmit={(swap) => void submit(swap, false)}
                onStop={interrupt}
              />
            </div>
          </div>
        </div>
        {hero && selection?.sessionId === null && projectId !== NO_PROJECT && (
          <WorktreeBar key={key} machine={machine} projectId={projectId} />
        )}
      </Wrapper>
    </div>
  )
}
