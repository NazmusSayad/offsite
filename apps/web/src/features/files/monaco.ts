import { getFiletypeFromFileName } from '@pierre/diffs'
import { shikiToMonaco } from '@shikijs/monaco'
import 'monaco-editor/basic-languages/monaco.contribution'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/features/register.all'
import {
  bundledLanguagesInfo,
  bundledThemesInfo,
  createHighlighter,
} from 'shiki'
import { currentScheme } from '@/lib/theme'

self.MonacoEnvironment = {
  async getWorker() {
    const loaded = await import('monaco-editor/editor/editor.worker?worker')
    return new loaded.default()
  },
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
