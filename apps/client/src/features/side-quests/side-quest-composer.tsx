import { PaperclipIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { attachFiles, attachPasted } from '@/features/composer/attach'
import { isPasteInline } from '@/features/composer/attached-images'
import {
  ComposerInput,
  focusComposer,
  hasComposer,
} from '@/features/composer/composer-input'
import {
  ComposerMenu,
  useProjectFiles,
  useSuggestions,
} from '@/features/composer/composer-menu'
import { useDictation } from '@/features/composer/dictation'
import { editDraft, fileMarker, useDraft } from '@/features/composer/drafts'
import { DictateButton, SendControls } from '@/features/composer/send-controls'
import { type Selection, showError } from '@/lib/store'
import { touch } from '@/lib/utils'
import { sendSideDraft, sideDraftKey, takeInputFocus } from './ask'

export function SideQuestComposer(props: {
  selection: Selection
  sessionId: string
  lastQuestion: string | null
}) {
  const key = sideDraftKey(props.selection.machine, props.sessionId)
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
  const files = useProjectFiles(
    props.selection.machine,
    props.selection.projectId,
    props.selection.worktreeId
  )
  const knownFiles = useMemo(() => new Set(files), [files])
  const [caret, setCaret] = useState(text.length)
  const [sending, setSending] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const pasteInline = useRef(false)
  const dictation = useDictation(key, false)
  const suggestions = useSuggestions({
    draft: key,
    text,
    caret,
    commands: [],
    files,
  })
  const empty = text.trim() === '' || sending

  useEffect(() => {
    if (!takeInputFocus()) {
      return
    }
    setTimeout(() => {
      if (hasComposer(key)) {
        focusComposer(key)
      }
    })
  }, [key])

  function edit(value: string, position: number) {
    editDraft(key, (current) => ({ ...current, text: value }))
    setCaret(position)
    suggestions.reset()
  }

  async function submit() {
    if (empty) {
      return
    }
    setSending(true)
    try {
      await sendSideDraft(props.selection, props.sessionId)
      setCaret(0)
    } catch (error) {
      showError(error)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="relative shrink-0 px-3">
      <ComposerMenu suggestions={suggestions} />
      <div
        className="composer-glass shadow-composer relative z-10 rounded-t-3xl border border-b-0 border-(--composer-outline) transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-[color-mix(in_srgb,var(--text)_16%,transparent)] focus-within:ring-4 focus-within:ring-[color-mix(in_srgb,var(--text)_4%,transparent)] dark:shadow-none"
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
          void attachFiles(key, [...event.dataTransfer.files], caret, setCaret)
        }}
      >
        <div className="pb-1 md:pb-2">
          <ComposerInput
            main={false}
            label="Side question"
            text={text}
            editable
            newThread={false}
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
              if (suggestions.onKeyDown(event)) {
                return true
              }
              if (event.key === 'Enter' && !event.shiftKey && !touch.matches) {
                void submit()
                return true
              }
              if (
                event.key === 'ArrowUp' &&
                text === '' &&
                props.lastQuestion !== null
              ) {
                edit(props.lastQuestion, props.lastQuestion.length)
                return true
              }
              return false
            }}
            placeholder="Ask a side question, or @tag files/folders"
          />
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2 ps-2 pe-1.5 pb-1.5 sm:px-3.5 sm:pb-3 md:pe-3.25">
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
              <DictateButton dictation={dictation} desktop />
            </div>
            <SendControls
              dictation={dictation}
              running={false}
              empty={empty}
              loading={false}
              delivery={null}
              onSubmit={() => void submit()}
              onStop={() => {
                throw new Error('Side questions cannot be stopped')
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
