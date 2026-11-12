import { type Editor, Extension } from '@tiptap/core'
import { Document } from '@tiptap/extension-document'
import { Paragraph } from '@tiptap/extension-paragraph'
import { Text } from '@tiptap/extension-text'
import { UndoRedo } from '@tiptap/extensions'
import { splitBlock } from '@tiptap/pm/commands'
import { Fragment, Slice } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { EditorContent, useEditor } from '@tiptap/react'
import { useLayoutEffect } from 'react'
import { skillPill, skillRanges } from '@/lib/skills'
import { getState } from '@/lib/store'
import { cn } from '@/lib/utils'

let mounted: Editor | null = null

const Skills = Extension.create({
  name: 'skills',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: (state) => {
            const text = state.doc.textBetween(0, state.doc.content.size, '\n')
            return DecorationSet.create(
              state.doc,
              skillRanges(text, getState().capabilities?.commands ?? []).map(
                (range) =>
                  Decoration.inline(
                    positionOf(text, range.start),
                    positionOf(text, range.end),
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
  text: string
  placeholder: string
  compact: boolean
  onEdit: (text: string, caret: number) => void
  onCaret: (caret: number) => void
  onKeyDown: (event: KeyboardEvent) => boolean
  onPaste: (event: ClipboardEvent) => boolean
}) {
  const editor = useEditor({
    immediatelyRender: true,
    extensions: [Document, Paragraph, Text, UndoRedo, Skills],
    content: documentOf(props.text),
    coreExtensionOptions: { clipboardTextSerializer: { blockSeparator: '\n' } },
    editorProps: {
      attributes: {
        'data-composer': '',
        'data-placeholder': props.placeholder,
        'aria-placeholder': props.placeholder,
        spellcheck: 'false',
        autocorrect: 'off',
        'data-gramm': 'false',
        'data-gramm_editor': 'false',
        'data-enable-grammarly': 'false',
        'data-lt-active': 'false',
        class: cn(
          'px-2.5 outline-none sm:px-4',
          !props.compact && 'pt-2 sm:pt-4 md:pt-3.5',
          props.text === '' &&
            'before:text-placeholder/75 before:pointer-events-none before:float-left before:h-0 before:content-[attr(data-placeholder)]'
        ),
      },
      clipboardTextParser: (text, context) => {
        const schema = context.doc.type.schema
        return new Slice(
          Fragment.from(
            text
              .replace(/\r\n?/g, '\n')
              .split('\n')
              .map((line) =>
                schema.node(
                  'paragraph',
                  null,
                  line === '' ? [] : [schema.text(line)]
                )
              )
          ),
          1,
          1
        )
      },
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
      handlePaste: (_view, event) => props.onPaste(event),
    },
    onUpdate: (options) =>
      props.onEdit(
        textOf(options.editor),
        caretOf(options.editor, options.editor.state.selection.head)
      ),
    onSelectionUpdate: (options) =>
      props.onCaret(
        caretOf(options.editor, options.editor.state.selection.head)
      ),
  })

  useLayoutEffect(() => {
    mounted = editor
    return () => {
      mounted = null
    }
  }, [editor])

  useLayoutEffect(() => {
    if (textOf(editor) === props.text) {
      return
    }
    editor
      .chain()
      .setContent(documentOf(props.text), { emitUpdate: false })
      .setTextSelection(positionOf(props.text, props.text.length))
      .run()
  }, [editor, props.text])

  return (
    <EditorContent
      editor={editor}
      className={cn(
        'grid overflow-y-auto text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap',
        props.compact
          ? 'max-h-52 min-h-19.5'
          : 'max-h-55.5 min-h-20 sm:max-h-56 [@media(min-height:840px)]:min-h-23 sm:[@media(min-height:840px)]:min-h-23.5'
      )}
    />
  )
}

export function composerCaret() {
  const editor = mountedEditor()
  return caretOf(editor, editor.state.selection.head)
}

export function moveComposerCaret(caret: number, focus: boolean) {
  const editor = mountedEditor()
  editor.commands.setTextSelection(positionOf(textOf(editor), caret))
  if (focus) {
    editor.view.focus()
  }
}

export function replaceComposerText(start: number, end: number, value: string) {
  const editor = mountedEditor()
  const text = textOf(editor)
  editor.view.dispatch(
    editor.state.tr.insertText(
      value,
      positionOf(text, start),
      positionOf(text, end)
    )
  )
}

export function focusComposer() {
  mountedEditor().view.focus()
}

function mountedEditor() {
  if (mounted === null) {
    throw new Error('The composer is not mounted')
  }
  return mounted
}

function documentOf(text: string) {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => ({
      type: 'paragraph',
      content: line === '' ? [] : [{ type: 'text', text: line }],
    })),
  }
}

function textOf(editor: Editor) {
  return editor.getText({ blockSeparator: '\n' })
}

function caretOf(editor: Editor, position: number) {
  return editor.state.doc.textBetween(0, position, '\n').length
}

function positionOf(text: string, caret: number) {
  return caret + 1 + (text.slice(0, caret).match(/\n/g)?.length ?? 0)
}
