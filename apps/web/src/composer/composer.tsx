import { ListPlusIcon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Delivery, Message } from '@server/protocol'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ComposerMenu, type Suggestion } from '@/composer/composer-menu'
import { editDraft, useDraft } from '@/composer/drafts'
import { MoreMenu, modes } from '@/composer/more-menu'
import { PermissionPrompt } from '@/composer/permission-prompt'
import { Pickers } from '@/composer/pickers'
import { call } from '@/connection'
import { cn, mod } from '@/lib/utils'
import { useProjectName } from '@/projects'
import {
  changeSettings,
  getState,
  interrupt,
  sendPrompt,
  setDraft,
  showError,
  unqueue,
  selectedRunning,
  useStore,
} from '@/store'
import { readBase64, uploadFile } from '@/upload'

const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const maxImageSize = 5 * 1024 * 1024

export function Composer() {
  const selection = useStore((state) => state.selection)
  const loaded = useStore((state) => state.loaded)
  const blank = useStore(
    (state) => state.messages.length === 0 && state.partial === ''
  )
  const requests = useStore((state) => state.requests)
  const queue = useStore((state) => state.queue)
  const draft = useStore((state) => state.draft)
  const capabilities = useStore((state) => state.capabilities)
  const noAccount = useStore((state) => state.settings.accountId === null)
  const [uploads, setUploads] = useState(0)
  const [sending, setSending] = useState(false)
  const [active, setActive] = useState(0)
  const [menuClosed, setMenuClosed] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const input = useRef<HTMLTextAreaElement>(null)
  const picker = useRef<HTMLInputElement>(null)
  const cwd = selection?.cwd ?? ''
  const key = selection?.sessionId ?? cwd
  const stored = useDraft(key)
  const text = stored.text
  const images = stored.images
  const [caret, setCaret] = useState(text.length)
  const projectTitle = useProjectName(cwd)
  const running = useStore(selectedRunning)
  const hero = loaded && blank && !running
  const request = requests.at(0)

  useEffect(() => {
    const element = input.current
    if (element === null) return
    element.focus()
    element.setSelectionRange(element.value.length, element.value.length)
  }, [selection])

  useEffect(() => {
    if (draft === null) return
    editDraft(key, (current) => ({ ...current, text: draft }))
    setCaret(draft.length)
    setDraft(null)
    input.current?.focus()
  }, [draft, key])

  useEffect(() => {
    call('files.list', { cwd }).then(setFiles, showError)
  }, [cwd])

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
    editDraft(key, (current) => ({ ...current, text: value }))
    setCaret(position)
    setActive(0)
    setMenuClosed(false)
  }

  function pick(item: Suggestion) {
    if (trigger === null) return
    const start = caret - trigger.length
    const position = start + item.insert.length + 1
    edit(`${text.slice(0, start)}${item.insert} ${text.slice(caret)}`, position)
    requestAnimationFrame(() =>
      input.current?.setSelectionRange(position, position)
    )
  }

  async function submit(delivery: Delivery) {
    if (empty) return
    setSending(true)
    try {
      await sendPrompt({ text: text.trim(), images }, delivery)
      editDraft(key, (current) => ({ ...current, text: '', images: [] }))
      setCaret(0)
    } catch (error) {
      showError(error)
    } finally {
      setSending(false)
    }
  }

  function cycleMode() {
    const index = modes.findIndex(
      (mode) => mode.value === getState().settings.permissionMode
    )
    changeSettings({ permissionMode: modes[(index + 1) % modes.length].value })
  }

  async function attach(list: File[]) {
    for (const file of list) {
      if (imageTypes.includes(file.type) && file.size <= maxImageSize) {
        const data = await readBase64(file)
        editDraft(key, (current) => ({
          ...current,
          images: [...current.images, { mediaType: file.type, data }],
        }))
        continue
      }
      setUploads((count) => count + 1)
      try {
        const path = await uploadFile(file)
        editDraft(key, (current) => ({
          ...current,
          text:
            current.text === '' || /\s$/.test(current.text)
              ? `${current.text}@${path} `
              : `${current.text} @${path} `,
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
          ? 'absolute inset-0 flex items-center'
          : 'relative shrink-0 before:absolute before:inset-x-0 before:bottom-full before:h-8 before:bg-linear-to-t before:from-background before:to-transparent'
      )}
    >
      <div className={cn('w-full px-3 sm:px-12', hero && 'pb-3 sm:pb-4')}>
        <div className="pointer-events-auto relative z-10 mx-auto w-full max-w-(--chat-content-max-width)">
          {hero && (
            <div className="absolute inset-x-0 bottom-full pb-4">
              <h1 className="text-foreground w-full text-center text-2xl font-normal tracking-tight sm:text-3xl">
                What should we build in{' '}
                <span
                  className="border-muted-foreground/35 inline-block max-w-64 truncate border-b border-dotted align-bottom"
                  title={cwd}
                >
                  {projectTitle}
                </span>
                ?
              </h1>
            </div>
          )}
          {queue.length > 0 && suggestions.length === 0 && (
            <div className="composer-glass relative mx-auto -mb-[calc(1rem+1px)] w-[calc(100%-2.75rem)] rounded-t-2xl border border-b-0 border-(--composer-outline) px-1 pt-1 pb-[calc(1rem+1px+0.25rem)] text-xs/4">
              {queue.map((item) => (
                <div
                  key={item.id}
                  className="grid min-h-6 grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-1"
                >
                  <HugeiconsIcon
                    icon={ListPlusIcon}
                    className="text-muted-foreground mx-auto size-3"
                  />
                  <span className="text-secondary-label truncate">
                    {item.prompt.text === ''
                      ? `${item.prompt.images.length} image(s)`
                      : item.prompt.text}
                  </span>
                  <Button
                    variant="ghost-muted"
                    size="icon-xs"
                    title="Remove from queue"
                    onClick={() => unqueue(item.id)}
                  >
                    <HugeiconsIcon icon={XIcon} />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {request !== undefined && suggestions.length === 0 && (
            <PermissionPrompt
              key={request.id}
              request={request}
              cwd={cwd}
              count={requests.length}
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
              request?.toolName === 'AskUserQuestion' && 'hidden'
            )}
            onMouseDown={(event) => {
              if (!(event.target instanceof Element)) return
              if (!event.currentTarget.contains(event.target)) return
              if (event.target.closest('button, a, input, textarea')) return
              event.preventDefault()
              input.current?.focus()
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              void attach([...event.dataTransfer.files])
            }}
          >
            <div className="px-3 pt-3.5 pb-2 sm:px-4 sm:pt-4">
              {images.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {images.map((image, index) => (
                    <div
                      key={index}
                      className="border-border/80 bg-background relative size-16 overflow-hidden rounded-lg border"
                    >
                      <img
                        src={`data:${image.mediaType};base64,${image.data}`}
                        alt=""
                        className="size-full object-cover"
                      />
                      <button
                        className="absolute top-1 right-1 grid size-5 cursor-pointer place-items-center rounded-full bg-black/60 text-white"
                        title="Remove image"
                        onClick={() =>
                          editDraft(key, (current) => ({
                            ...current,
                            images: current.images.filter(
                              (_, other) => other !== index
                            ),
                          }))
                        }
                      >
                        <HugeiconsIcon icon={XIcon} className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                onSelect={(event) =>
                  setCaret(event.currentTarget.selectionStart)
                }
                onPaste={(event) => {
                  const text = event.clipboardData.getData('text/plain')
                  if (text !== '') {
                    event.preventDefault()
                    document.execCommand('insertText', false, text)
                    return
                  }
                  const pasted = [...event.clipboardData.files]
                  if (pasted.length === 0) return
                  event.preventDefault()
                  void attach(pasted)
                }}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing) return
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
                    void submit(
                      event.metaKey || event.ctrlKey ? 'steer' : 'queue'
                    )
                    return
                  }
                  if (event.key === 'Tab' && event.shiftKey) {
                    event.preventDefault()
                    cycleMode()
                    return
                  }
                  if (event.key === 'ArrowUp' && text === '') {
                    const last = lastUserText(getState().messages)
                    if (last === null) return
                    event.preventDefault()
                    edit(last, last.length)
                    return
                  }
                  if (event.key === 'Escape' && running) interrupt()
                }}
                placeholder={
                  noAccount
                    ? 'Add a Claude account in Settings → Accounts to start'
                    : running
                      ? `Queue a follow-up… (${mod}+Enter to send now)`
                      : 'Ask anything, @tag files/folders, or / for commands'
                }
                className="placeholder:text-placeholder/75 block [field-sizing:content] max-h-52 min-h-19.5 w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
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
                <MoreMenu onAttach={() => picker.current?.click()} />
                {running && empty ? (
                  <button
                    className="bg-destructive/90 shadow-destructive/24 hover:bg-destructive flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-white shadow-xs transition-colors"
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
                    className="bg-message-action text-message-action-foreground shadow-message-action/24 hover:bg-message-action-hover relative flex size-8 items-center justify-center overflow-hidden rounded-full shadow-xs transition-all duration-150 hover:scale-105 enabled:cursor-pointer disabled:pointer-events-none disabled:opacity-64 disabled:shadow-none"
                    title={
                      running
                        ? `Queue (Enter) · Send now (${mod}+Enter)`
                        : 'Send (Enter)'
                    }
                    aria-label="Send message"
                    disabled={empty}
                    onClick={(event) =>
                      void submit(
                        event.metaKey || event.ctrlKey ? 'steer' : 'queue'
                      )
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
        </div>
      </div>
    </div>
  )
}

function lastUserText(messages: Message[]) {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.type !== 'user') continue
    const block = message.content.find(
      (item) => item.type === 'text' && !item.text.startsWith('<')
    )
    if (block?.type === 'text') return block.text
  }
  return null
}
