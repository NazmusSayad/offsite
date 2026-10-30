import { getFiletypeFromFileName } from '@pierre/diffs'
import { shikiToMonaco } from '@shikijs/monaco'
import 'monaco-editor/basic-languages/monaco.contribution'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/features/register.all'
import {
  MenuId,
  MenuRegistry,
} from 'monaco-editor/platform/actions/common/actions'
import {
  bundledLanguagesInfo,
  bundledThemesInfo,
  createHighlighter,
} from 'shiki'
import type { EditorPrefs } from '@/lib/prefs'
import { currentScheme } from '@/lib/theme'

self.MonacoEnvironment = {
  async getWorker() {
    const loaded = await import('monaco-editor/editor/editor.worker?worker')
    return new loaded.default()
  },
}

export type Block = {
  mapping: {
    innerChanges: {
      originalRange: monaco.IRange
      modifiedRange: monaco.IRange
    }[]
  }
  originalWithModifiedChanges: string
}

export function registerBlockAction(
  kind: 'stage' | 'unstage',
  run: (block: Block) => void
) {
  const command = monaco.editor.registerCommand(
    'offsite.block',
    (accessor, block) => run(block)
  )
  const label = kind === 'stage' ? 'Stage' : 'Unstage'
  const icon = { id: kind === 'stage' ? 'add' : 'remove' }
  const items = [
    MenuRegistry.appendMenuItem(MenuId.DiffEditorHunkToolbar, {
      command: { id: 'offsite.block', title: `${label} Block`, icon },
      group: 'primary',
      order: 10,
    }),
    MenuRegistry.appendMenuItem(MenuId.DiffEditorSelectionToolbar, {
      command: { id: 'offsite.block', title: `${label} Selection`, icon },
      group: 'primary',
      order: 10,
    }),
  ]
  return () => {
    command.dispose()
    for (const item of items) {
      item.dispose()
    }
  }
}

export function revertBlock(
  original: monaco.editor.ITextModel,
  modified: monaco.editor.ITextModel,
  mapping: Block['mapping']
) {
  let text = modified.getValue()
  for (const change of mapping.innerChanges.slice().reverse()) {
    const range = change.modifiedRange
    text =
      text.slice(
        0,
        modified.getOffsetAt({
          lineNumber: range.startLineNumber,
          column: range.startColumn,
        })
      ) +
      original.getValueInRange(change.originalRange) +
      text.slice(
        modified.getOffsetAt({
          lineNumber: range.endLineNumber,
          column: range.endColumn,
        })
      )
  }
  return text
}

const highlighter = createHighlighter({ themes: [], langs: [] })

const configurations = new Map([
  [
    'tsx',
    () => import('monaco-editor/languages/definitions/typescript/typescript'),
  ],
  [
    'jsx',
    () => import('monaco-editor/languages/definitions/javascript/javascript'),
  ],
  [
    'json',
    () => import('monaco-editor/languages/definitions/javascript/javascript'),
  ],
  [
    'jsonc',
    () => import('monaco-editor/languages/definitions/javascript/javascript'),
  ],
  [
    'shellscript',
    () => import('monaco-editor/languages/definitions/shell/shell'),
  ],
  [
    'docker',
    () => import('monaco-editor/languages/definitions/dockerfile/dockerfile'),
  ],
  ['c', () => import('monaco-editor/languages/definitions/cpp/cpp')],
  [
    'objective-cpp',
    () => import('monaco-editor/languages/definitions/cpp/cpp'),
  ],
  ['vue', () => import('monaco-editor/languages/definitions/html/html')],
  ['svelte', () => import('monaco-editor/languages/definitions/html/html')],
])

export { monaco }

export async function loadLanguage(path: string) {
  const type = getFiletypeFromFileName(path)
  const info = bundledLanguagesInfo.find(
    (item) => item.id === type || item.aliases?.includes(type) === true
  )
  if (info === undefined) {
    return { id: 'plaintext', name: 'Plain Text' }
  }
  const instance = await highlighter
  if (!instance.getLoadedLanguages().includes(info.id)) {
    await instance.loadLanguage(info.import)
    if (!monaco.languages.getLanguages().some((item) => item.id === info.id)) {
      monaco.languages.register({ id: info.id })
      const configuration = configurations.get(info.id)
      if (configuration !== undefined) {
        monaco.languages.setLanguageConfiguration(
          info.id,
          (await configuration()).conf
        )
      }
    }
    await applyTheme()
  }
  return { id: info.id, name: info.name }
}

export async function applyTheme() {
  const scheme = currentScheme()
  const info = bundledThemesInfo.find((item) => item.id === scheme.codeTheme)
  if (info === undefined) {
    throw new Error(`unknown code theme ${scheme.codeTheme}`)
  }
  const theme = (await info.import()).default
  const instance = await highlighter
  await instance.loadTheme({
    ...theme,
    colors: { ...theme.colors, 'editor.background': scheme.background },
  })
  shikiToMonaco(instance, monaco)
  monaco.editor.setTheme(scheme.codeTheme)
}

export function editorOptions(
  prefs: EditorPrefs
): monaco.editor.IEditorOptions & monaco.editor.IGlobalEditorOptions {
  return {
    fontFamily: prefs.font.family,
    fontSize: prefs.font.size,
    lineHeight: prefs.font.lineHeight,
    fontLigatures: !prefs.font.ligatures
      ? false
      : prefs.font.features === ''
        ? true
        : prefs.font.features,
    cursorStyle: prefs.cursor.style === 'bar' ? 'line' : prefs.cursor.style,
    cursorBlinking: prefs.cursor.blink ? 'expand' : 'solid',
    tabSize: prefs.tabSize,
    insertSpaces: true,
    detectIndentation: false,
    trimAutoWhitespace: false,
    wordWrap: prefs.wordWrap ? 'on' : 'off',
    wrappingStrategy: 'advanced',
    minimap: { enabled: false },
    stickyScroll: { enabled: false },
    overviewRulerBorder: false,
    padding: { top: 3, bottom: 48 },
    cursorSurroundingLines: 2,
    copyWithSyntaxHighlighting: false,
    accessibilitySupport: 'off',
    guides: {
      bracketPairs: true,
      bracketPairsHorizontal: false,
      highlightActiveBracketPair: true,
      highlightActiveIndentation: true,
    },
    dragAndDrop: false,
    glyphMargin: false,
    useTabStops: false,
    selectionHighlight: false,
    emptySelectionClipboard: false,
    renderWhitespace: 'selection',
    smartSelect: { selectLeadingAndTrailingWhitespace: false },
    scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    hover: { above: false },
    find: { cursorMoveOnType: false },
    acceptSuggestionOnCommitCharacter: false,
    suggestSelection: 'first',
    suggest: {
      localityBonus: true,
      insertMode: 'replace',
      snippetsPreventQuickSuggestions: false,
    },
    quickSuggestions: { comments: 'on', strings: 'on', other: 'on' },
    quickSuggestionsDelay: 0,
  }
}

export async function loadEditorFont(prefs: EditorPrefs) {
  await document.fonts.load(`${prefs.font.size}px ${prefs.font.family}`)
  monaco.editor.remeasureFonts()
}
