import { PaperclipIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Item } from '@offsite/core/items'
import { useEffect, useRef, useState } from 'react'
import { call } from '@/api/connection'
import { machineKey } from '@/api/machines'
import { readBase64, uploadFile } from '@/api/upload'
import { Button } from '@/components/ui/button'
import { Wrapper } from '@/components/wrapper'
import { changeSettings } from '@/lib/accounts'
import { interrupt, sendPrompt } from '@/lib/sessions'
import {
  getState,
  machineOf,
  projectOf,
  setDraft,
  showError,
  selectedRunning,
  useStore,
} from '@/lib/store'
import { cn, mod } from '@/lib/utils'
import {
  AttachedImages,
  lastImageNumber,
  restoredDraft,
} from './attached-images'
import { ComposerMenu, type Suggestion } from './composer-menu'
import { editDraft, getDraft, useDraft } from './drafts'
import { MoreMenu, providerModes } from './more-menu'
import { PermissionPrompt } from './permission-prompt'
import { Pickers } from './pickers'
import { ProjectHeading } from './project-heading'
import { QueuedMessages } from './queue'

const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const maxImageSize = 5 * 1024 * 1024

export function Composer() {
  const selection = useStore((state) => state.selection)
  const loaded = useStore((state) => state.loaded)
  const blank = useStore(
    (state) => state.items.length === 0 && state.partial === ''
  )
  const requests = useStore((state) => state.requests)
  const queue = useStore((state) => state.queue)
  const draft = useStore((state) => state.draft)
  const capabilities = useStore((state) => state.capabilities)
  const noAccount = useStore((state) =>
    state.settings.provider === 'opencode'
      ? state.machines.find(
          (machine) => machine.id === state.selection?.machine
        )?.openCode.available !== true
      : state.settings.accountId === null
  )
  const [uploads, setUploads] = useState(0)
  const [sending, setSending] = useState(false)
  const [active, setActive] = useState(0)
  const [menuClosed, setMenuClosed] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const machine = selection?.machine ?? ''
  const projectId = selection?.projectId ?? ''
  const project = useStore((state) => projectOf(state, machine, projectId))
  const status = useStore((state) => machineOf(state, machine).status)
  const delivery = useStore(
    (state) => machineOf(state, machine).config?.delivery ?? null
  )
  const key = machineKey(machine, selection?.sessionId ?? projectId)
  const stored = useDraft(key)
  const text = stored.text
  const images = stored.images
  const [caret, setCaret] = useState(text.length)
  const running = useStore(selectedRunning)
  const hero = loaded && blank && !running
  const request = requests.at(0)

  useEffect(() => {
    const element = input.current
    if (element === null) {
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
    call(machine, 'files.list', { projectId }).then(setFiles, showError)
  }, [machine, projectId, status])

  const before = text.slice(0, caret)
  const trigger =
    /^\/\S*$/.exec(before)?.[0] ?? /(?:^|\s)(@\S*)$/.exec(before)?.[1] ?? null
  const query = trigger?.slice(1).toLowerCase() ?? ''
  const suggestions: Suggestion[] =
    trigger === null || menuClosed
      ? []
      : trigger.startsWith('/')
        ? (capabilities?.commands ?? [])
            .filter((command) => command.name.toLowerCase().includes(query))
            .sort(
              (a, b) =>
                Number(!a.name.toLowerCase().startsWith(query)) -
                Number(!b.name.toLowerCase().startsWith(query))
            )
            .map((command) => ({
              key: command.name,
              label: `/${command.name}${command.hint === '' ? '' : ` ${command.hint}`}`,
              description: command.description,
              insert: `/${command.name}`,
            }))
        : files
            .filter((file) => file.toLowerCase().includes(query))
            .slice(0, 50)
            .map((file) => ({
              key: file,
              label: file,
              description: '',
              insert: `@${file}`,
            }))
  const activeIndex = Math.min(active, suggestions.length - 1)
  const empty =
    (text.trim() === '' && images.length === 0) ||
    uploads > 0 ||
    sending ||
    noAccount

  function edit(value: string, position: number) {
    editDraft(key, (current) => ({
      ...current,
      text: value,
      images: current.images.filter((image) =>
        value.includes(`[Image #${image.number}]`)
      ),
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

  async function submit(swap: boolean) {
    if (empty) {
      return
    }
    setSending(true)
    try {
      if (delivery === null) {
        throw new Error('This machine is not connected')
      }
      await sendPrompt(
        {
          text: text.trim(),
          images: images.map((image) => ({
            mediaType: image.mediaType,
            data: image.data,
          })),
        },
        swap ? (delivery === 'queue' ? 'steer' : 'queue') : delivery
      )
      editDraft(key, (current) => ({ ...current, text: '', images: [] }))
      setCaret(0)
    } catch (error) {
      showError(error)
    } finally {
      setSending(false)
    }
  }

  function cycleMode() {
    const settings = getState().settings
    const list = providerModes(settings.provider, getState().capabilities)
    if (list.length === 0) {
      return
    }
    const index = list.findIndex((mode) => mode.value === settings.mode)
    changeSettings({ mode: list[(index + 1) % list.length].value })
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
      setUploads((count) => count + 1)
      try {
        const path = await uploadFile(machine, file)
        editDraft(key, (current) => ({
          ...current,
          text: `${current.text}${/(^|\s)$/.test(current.text) ? '' : ' '}@${path} `,
        }))
      } catch (error) {
        showError(error)
      } finally {
        setUploads((count) => count - 1)
      }
    }
  }

  return (
    <div
      className={cn(
        'pointer-events-none z-20',
        hero
          ? 'absolute inset-0 flex items-center pb-3 sm:pb-4'
          : 'relative shrink-0 before:absolute before:right-(--app-scrollbar-width) before:bottom-full before:left-0 before:h-8 before:bg-linear-to-t before:from-background before:to-transparent'
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
        {queue.length > 0 && suggestions.length === 0 && <QueuedMessages />}
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
            'composer-glass shadow-composer relative z-10 border border-(--composer-outline) dark:shadow-none',
            hero ? 'rounded-3xl' : 'rounded-t-3xl border-b-0',
            request?.kind === 'question' && 'hidden'
          )}
          onMouseDown={(event) => {
            if (!(event.target instanceof Element)) {
              return
            }
            if (!event.currentTarget.contains(event.target)) {
              return
            }
            if (event.target.closest('button, a, input, textarea')) {
              return
            }
            event.preventDefault()
            input.current?.focus()
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            void attach([...event.dataTransfer.files])
          }}
        >
          <div className={cn('pb-2', images.length > 0 && 'pt-3.5 sm:pt-4')}>
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
                if (text !== '') {
                  event.preventDefault()
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
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void submit(event.metaKey || event.ctrlKey)
                  return
                }
                if (event.key === 'Tab' && event.shiftKey) {
                  event.preventDefault()
                  cycleMode()
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
                'placeholder:text-placeholder/75 block [field-sizing:content] w-full resize-none bg-transparent px-3 text-sm leading-relaxed outline-none sm:px-4',
                images.length > 0
                  ? 'max-h-52 min-h-19.5'
                  : 'max-h-55.5 min-h-23 pt-3.5 sm:max-h-56 sm:min-h-23.5 sm:pt-4'
              )}
            />
          </div>
          <div
            className={cn(
              'flex min-w-0 items-center justify-between gap-2 px-3 sm:px-4',
              hero ? 'pb-3 sm:pb-4' : 'pb-2.5 sm:pb-3.5'
            )}
          >
            <div className="-m-1 -ms-3.5 flex min-w-0 flex-1 [scrollbar-width:none] items-center gap-1 overflow-x-auto p-1 ps-3.5">
              <Pickers />
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
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
              {uploads > 0 && (
                <span className="text-muted-foreground text-xs">
                  Uploading…
                </span>
              )}
              <MoreMenu />
              <Button
                variant="ghost"
                size="icon-sm"
                title="Attach files"
                aria-label="Attach files"
                onClick={() => picker.current?.click()}
              >
                <HugeiconsIcon icon={PaperclipIcon} />
              </Button>
              {running && empty ? (
                <button
                  className="bg-destructive/90 shadow-destructive/24 hover:bg-destructive flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-white shadow-xs transition-colors"
                  title="Stop (Esc)"
                  aria-label="Stop generation"
                  onClick={interrupt}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect x="2" y="2" width="8" height="8" rx="1.5" />
                  </svg>
                </button>
              ) : (
                <button
                  className="bg-message-action text-message-action-foreground shadow-message-action/24 hover:bg-message-action-hover relative flex size-9 items-center justify-center overflow-hidden rounded-full shadow-xs transition-all duration-150 hover:scale-105 enabled:cursor-pointer disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none"
                  title={
                    running && delivery === 'steer'
                      ? `Send now (Enter) · Queue (${mod}+Enter)`
                      : running
                        ? `Queue (Enter) · Send now (${mod}+Enter)`
                        : 'Send (Enter)'
                  }
                  aria-label="Send message"
                  disabled={empty}
                  onClick={(event) =>
                    void submit(event.metaKey || event.ctrlKey)
                  }
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </Wrapper>
    </div>
  )
}

function lastUserText(items: Item[]) {
  for (let index = items.length - 1; index >= 0; index--) {
    const item = items[index]
    if (
      item.kind === 'user' &&
      item.parent === null &&
      item.format === 'text' &&
      item.text !== ''
    ) {
      return item.text
    }
  }
  return null
}
