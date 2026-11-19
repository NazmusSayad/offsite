import { type Editor, Extension } from '@tiptap/core'
import { Document } from '@tiptap/extension-document'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Text } from '@tiptap/extension-text'
import { UndoRedo } from '@tiptap/extensions'
import { splitBlock } from '@tiptap/pm/commands'
import { Fragment, type Node, type Schema, Slice } from '@tiptap/pm/model'
import { type EditorState, Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useLayoutEffect } from 'react'
import { sideQuestCommands } from '@/features/side-quests/ask'
import { skillPill, skillRanges } from '@/lib/skills'
import { getState, showError } from '@/lib/store'
import { cn, touch } from '@/lib/utils'
import { Attachment, DraftContext } from './composer-attachment'
import { copiedPrompt, copyPrompt, pastePrompt } from './copy'
import { prepareDraftFiles, useDraft } from './drafts'

const editors = new Map<string, Editor>()

const Skills = Extension.create({
  name: 'skills',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            return DecorationSet.create(
              state.doc,
              skillRanges(textOf(state.doc), [
                ...sideQuestCommands(getState().settings.provider),
                ...(getState().capabilities?.commands ?? []),
              ]).map((range) =>
                Decoration.inline(
                  positionOf(state.doc, range.start),
                  positionOf(state.doc, range.end),
                  { class: skillPill }
                )
              )
            )
          },
        },
      }),
    ]
  },
})

export function ComposerInput(props: {
  main: boolean
  label: string | null
  text: string
  editable: boolean
  markers: string[]
  files: Set<string>
  placeholder: string
  newThread: boolean
  onEdit: (text: string, caret: number) => void
  onCaret: (caret: number) => void
  onKeyDown: (event: KeyboardEvent) => boolean
  onPaste: (event: ClipboardEvent) => boolean
  draft: string
}) {
  const draftFiles = useDraft(props.draft).files
  const editor = useEditor({
    immediatelyRender: true,
    editable: props.editable,
    extensions: [Document, Paragraph, Text, UndoRedo, Skills, Attachment],
    content: documentOf(props.text, props.markers, props.files),
    coreExtensionOptions: { clipboardTextSerializer: { blockSeparator: '\n' } },
    editorProps: {
      attributes: {
        ...(props.main ? { 'data-composer': '' } : {}),
        ...(props.label === null ? {} : { 'aria-label': props.label }),
        'data-placeholder': props.placeholder,
        'aria-placeholder': props.placeholder,
        spellcheck: 'false',
        autocorrect: 'off',
        'data-gramm': 'false',
        'data-gramm_editor': 'false',
        'data-enable-grammarly': 'false',
        'data-lt-active': 'false',
        class: cn(
          'box-content min-w-0 px-2.5 pt-2 outline-none sm:px-4 sm:pt-4 md:pt-3.5',
          props.newThread &&
            'min-h-[3lh] sm:[@media(min-height:840px)]:min-h-[4lh]',
          !props.newThread &&
            'min-h-[2lh] sm:[@media(min-height:840px)]:min-h-[3lh]',
          props.text === '' &&
            'before:text-placeholder/75 before:pointer-events-none before:float-left before:h-0 before:content-[attr(data-placeholder)]'
        ),
      },
      handleDOMEvents: {
        copy: (view, event) =>
          copyPrompt(event, props.draft, selectedText(view.state)),
        cut: (view, event) => {
          if (!copyPrompt(event, props.draft, selectedText(view.state))) {
            return false
          }
          view.dispatch(view.state.tr.deleteSelection().scrollIntoView())
          return true
        },
      },
      clipboardTextParser: (text, context) =>
        sliceOf(text, context.doc.type.schema, props.markers, props.files),
      handleKeyDown: (view, event) => {
        if (event.isComposing || view.composing) {
          return false
        }
        if (props.onKeyDown(event)) {
          return true
        }
        if (event.key === 'Enter' && event.shiftKey) {
          return splitBlock(view.state, view.dispatch)
        }
        return false
      },
      handlePaste: (view, event) => {
        const copied = copiedPrompt(
          event.clipboardData?.getData('text/html') ?? ''
        )
        if (copied !== null) {
          pastePrompt(props.draft, copied, (text, markers) =>
            view.dispatch(
              view.state.tr
                .replaceSelection(
                  sliceOf(
                    text,
                    view.state.schema,
                    [...props.markers, ...markers],
                    props.files
                  )
                )
                .scrollIntoView()
            )
          ).catch(showError)
          return true
        }
        if (props.onPaste(event)) {
          return true
        }
        const text = event.clipboardData?.getData('text/plain') ?? ''
        if (text === '') {
          return false
        }
        view.dispatch(
          view.state.tr
            .replaceSelection(
              sliceOf(text, view.state.schema, props.markers, props.files)
            )
            .scrollIntoView()
        )
        return true
      },
    },
    onUpdate: (options) =>
      props.onEdit(
        textOf(options.editor.state.doc),
        caretOf(options.editor.state.doc, options.editor.state.selection.head)
      ),
    onSelectionUpdate: (options) =>
      props.onCaret(
        caretOf(options.editor.state.doc, options.editor.state.selection.head)
      ),
  })

  useEffect(() => {
    void prepareDraftFiles(draftFiles)
  }, [draftFiles])

  useLayoutEffect(() => {
    editors.set(props.draft, editor)
    return () => {
      editors.delete(props.draft)
    }
  }, [editor, props.draft])

  useEffect(() => {
    if (!props.main) {
      return
    }
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1 ||
        event.key === ' ' ||
        touch.matches ||
        !editor.isEditable ||
        editor.view.hasFocus() ||
        editor.view.dom.getClientRects().length === 0 ||
        document.getSelection()?.isCollapsed === false ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable], [role="textbox"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="menubar"], [role="listbox"], [role="combobox"], [role="grid"], [role="tree"], [role="tablist"], [role="radiogroup"], [role="slider"], [role="spinbutton"]'
          ) !== null)
      ) {
        return
      }
      event.preventDefault()
      editor.view.focus()
      editor.view.dispatch(
        editor.state.tr.insertText(event.key).scrollIntoView()
      )
    }
    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [editor, props.main])

  useLayoutEffect(() => {
    editor.setEditable(props.editable, false)
  }, [editor, props.editable])

  useLayoutEffect(() => {
    if (textOf(editor.state.doc) === props.text) {
      return
    }
    editor.commands.setContent(
      documentOf(props.text, props.markers, props.files),
      { emitUpdate: false }
    )
    editor.commands.setTextSelection(editor.state.doc.content.size)
  }, [editor, props.text, props.markers, props.files])

  useLayoutEffect(() => {
    const doc = editor.state.doc
    const next = editor.schema.nodeFromJSON(
      documentOf(textOf(doc), props.markers, props.files)
    )
    if (next.eq(doc)) {
      return
    }
    const caret = caretOf(doc, editor.state.selection.head)
    editor.commands.setContent(next.toJSON(), { emitUpdate: false })
    editor.commands.setTextSelection(positionOf(editor.state.doc, caret))
  }, [editor, props.markers, props.files])

  return (
    <DraftContext value={props.draft}>
      <EditorContent
        editor={editor}
        className={cn(
          'grid overflow-y-auto text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap',
          'max-h-55.5 sm:max-h-56'
        )}
      />
    </DraftContext>
  )
}

export function hasComposer(key: string) {
  return editors.has(key)
}

export function focusedComposer() {
  for (const entry of editors) {
    if (entry[1].view.hasFocus()) {
      return entry[0]
    }
  }
  return null
}

export function composerCaret(key: string) {
  const editor = mountedEditor(key)
  return caretOf(editor.state.doc, editor.state.selection.head)
}

export function moveComposerCaret(key: string, caret: number, focus: boolean) {
  const editor = mountedEditor(key)
  editor.commands.setTextSelection(positionOf(editor.state.doc, caret))
  if (focus) {
    editor.view.focus()
  }
}

export function replaceComposerText(
  key: string,
  start: number,
  end: number,
  value: string
) {
  const editor = mountedEditor(key)
  editor.view.dispatch(
    editor.state.tr.insertText(
      value,
      positionOf(editor.state.doc, start),
      positionOf(editor.state.doc, end)
    )
  )
}

export function insertComposerMarker(
  key: string,
  start: number,
  end: number,
  marker: string
) {
  const editor = mountedEditor(key)
  const schema = editor.state.schema
  editor.view.dispatch(
    editor.state.tr.replaceWith(
      positionOf(editor.state.doc, start),
      positionOf(editor.state.doc, end),
      [schema.nodes.attachment.create({ marker }), schema.text(' ')]
    )
  )
}

export function composerRect(key: string, caret: number) {
  const editor = mountedEditor(key)
  const coords = editor.view.coordsAtPos(positionOf(editor.state.doc, caret))
  return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top)
}

export function focusComposer(key: string) {
  mountedEditor(key).view.focus()
}

function mountedEditor(key: string) {
  const editor = editors.get(key)
  if (editor === undefined) {
    throw new Error('The composer is not mounted')
  }
  return editor
}

function documentOf(text: string, markers: string[], files: Set<string>) {
  const pattern = new RegExp(
    `(${[...markers.map((marker) => marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), '(?<!\\S)@\\S+'].join('|')})`
  )
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line
        .split(pattern)
        .filter((part) => part !== '')
        .map((part) =>
          markers.includes(part) ||
          (part.startsWith('@') && files.has(part.slice(1)))
            ? { type: 'attachment', attrs: { marker: part } }
            : { type: 'text', text: part }
        ),
    })),
  }
}

function sliceOf(
  text: string,
  schema: Schema,
  markers: string[],
  files: Set<string>
) {
  return new Slice(
    Fragment.fromJSON(
      schema,
      documentOf(text.replace(/\r\n?/g, '\n'), markers, files).content
    ),
    1,
    1
  )
}

function textOf(doc: Node, to = doc.content.size) {
  return doc.textBetween(0, to, '\n', (leaf) => String(leaf.attrs.marker))
}

function selectedText(state: EditorState) {
  return state.doc.textBetween(
    state.selection.from,
    state.selection.to,
    '\n',
    (leaf) => String(leaf.attrs.marker)
  )
}

function caretOf(doc: Node, position: number) {
  return textOf(doc, position).length
}

function positionOf(doc: Node, caret: number) {
  let offset = 0
  let found: number | null = null
  doc.forEach((paragraph, start, index) => {
    if (found !== null) {
      return
    }
    offset += index === 0 ? 0 : 1
    let position = start + 1
    if (caret <= offset) {
      found = position
      return
    }
    paragraph.forEach((child) => {
      if (found !== null) {
        return
      }
      const length = child.isText
        ? (child.text ?? '').length
        : String(child.attrs.marker).length
      if (caret <= offset + length) {
        found = child.isText ? position + caret - offset : position + 1
        return
      }
      offset += length
      position += child.nodeSize
    })
  })
  return found ?? doc.content.size - 1
}
