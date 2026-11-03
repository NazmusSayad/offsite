import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { call } from '@/api/connection'
import type { EditorState } from '@/features/files/editor-state'
import { loadLanguage, monaco } from '@/features/files/monaco'
import { useEditorShortcut } from '@/features/files/use-editor-shortcut'
import {
  fileTab,
  previewTab,
  type Side,
  type TabSpec,
} from '@/features/source-control/changes'
import { showError } from '@/lib/store'
import { errorMessage } from '@/lib/utils'

export type Document =
  | { status: 'loading' }
  | {
      status: 'text'
      original: monaco.editor.ITextModel | null
      modified: monaco.editor.ITextModel
      language: string
      saved: number
      dirty: boolean
      base: string
    }
  | { status: 'image'; src: string }
  | { status: 'large'; size: number; limit: number }
  | { status: 'binary' }
  | { status: 'error'; message: string }

type Tab = { spec: TabSpec; document: Document }

type TabsState = { tabs: Tab[]; active: string | null }

type Closing = { kind: 'tab'; id: string } | { kind: 'dialog' }

const syncing = new WeakSet<monaco.editor.ITextModel>()

export function useTabs(props: {
  machine: string
  projectId: string
  saved: EditorState
  onSaved: () => void
  onClose: () => void
}) {
  const [state, setState] = useState<TabsState>(() => ({
    tabs: props.saved.tabs.map((tab) => ({
      spec: tab.spec,
      document: { status: 'loading' },
    })),
    active: props.saved.active,
  }))
  const latest = useRef(state)
  const mounted = useRef(true)
  const held = useRef(new Set<monaco.editor.ITextModel>())
  const writes = useRef<Promise<unknown>>(Promise.resolve())
  const tabs = state.tabs
  const active = state.active
  const [closing, setClosing] = useState<Closing | null>(null)
  useEditorShortcut(requestClose, true)
  const [conflict, setConflict] = useState<TabSpec | null>(null)
  const dirty = tabs.filter(
    (tab) => tab.document.status === 'text' && tab.document.dirty
  )
  const closingTabs =
    closing?.kind === 'tab'
      ? tabs.filter((tab) => tab.spec.id === closing.id)
      : dirty
  const unsaved = dirty.length > 0

  useEffect(() => {
    if (!unsaved) {
      return
    }
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    addEventListener('beforeunload', warn)
    return () => removeEventListener('beforeunload', warn)
  }, [unsaved])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      queueMicrotask(() => {
        if (mounted.current) {
          return
        }
        const models = new Set([
          ...held.current,
          ...latest.current.tabs.flatMap((tab) => documentModels(tab.document)),
        ])
        for (const model of models) {
          model.dispose()
        }
      })
    }
  }, [])

  function commit(update: Partial<TabsState>) {
    latest.current = { ...latest.current, ...update }
    setState(latest.current)
  }

  function setActive(id: string) {
    commit({ active: id })
  }

  function releaseModels() {
    const current = new Set(tabs.flatMap((tab) => documentModels(tab.document)))
    for (const model of held.current) {
      if (!current.has(model)) {
        model.dispose()
      }
    }
    held.current = current
  }

  async function readSide(spec: TabSpec, side: Side) {
    if (side.kind === 'empty') {
      return ''
    }
    if (side.kind === 'git') {
      return call(props.machine, 'git.show', {
        projectId: props.projectId,
        repo: spec.repo,
        ref: side.ref,
        path: side.path,
      })
    }
    const result = await call(props.machine, 'files.read', {
      projectId: props.projectId,
      path: spec.path,
    })
    return result.kind === 'text' ? result.content : null
  }

  function readSides(spec: TabSpec) {
    return Promise.all([
      spec.left === null ? '' : readSide(spec, spec.left),
      readSide(spec, spec.right),
    ])
  }

  function update(id: string, document: Document) {
    commit({
      tabs: latest.current.tabs.map((item) =>
        item.spec.id === id ? { ...item, document } : item
      ),
    })
  }

  async function read(spec: TabSpec): Promise<Document> {
    try {
      if (spec.left === null && spec.right.kind === 'worktree') {
        const result = await call(props.machine, 'files.read', {
          projectId: props.projectId,
          path: spec.path,
        })
        if (result.kind === 'image') {
          return {
            status: 'image',
            src: `data:${result.mediaType};base64,${result.data}`,
          }
        }
        if (result.kind === 'large') {
          return { status: 'large', size: result.size, limit: result.limit }
        }
        if (result.kind === 'binary') {
          return { status: 'binary' }
        }
        return await textDocument(spec, '', result.content)
      }
      const sides = await readSides(spec)
      if (sides[0] === null || sides[1] === null) {
        return { status: 'binary' }
      }
      return await textDocument(spec, sides[0], sides[1])
    } catch (caught) {
      return { status: 'error', message: errorMessage(caught) }
    }
  }

  async function textDocument(
    spec: TabSpec,
    original: string,
    modified: string
  ): Promise<Document> {
    const language = await loadLanguage(spec.path)
    const left =
      spec.left === null
        ? null
        : monaco.editor.createModel(original, language.id)
    const right = monaco.editor.createModel(modified, language.id)
    right.onDidChangeContent(() => {
      if (syncing.has(right)) {
        return
      }
      const items = latest.current.tabs
      const tab = items.find(
        (item) =>
          item.document.status === 'text' && item.document.modified === right
      )
      if (tab === undefined || tab.document.status !== 'text') {
        return
      }
      const changed = right.getAlternativeVersionId() !== tab.document.saved
      if (tab.document.dirty === changed) {
        return
      }
      commit({
        tabs: items.map((item) =>
          item === tab
            ? { ...tab, document: { ...tab.document, dirty: changed } }
            : item
        ),
      })
    })
    return {
      status: 'text',
      original: left,
      modified: right,
      language: language.name,
      saved: right.getAlternativeVersionId(),
      dirty: false,
      base: modified,
    }
  }

  async function reload(id: string) {
    const tab = latest.current.tabs.find((item) => item.spec.id === id)
    if (tab?.document.status !== 'text' || tab.document.dirty) {
      return
    }
    const loaded = tab.document
    const before = loaded.modified.getAlternativeVersionId()
    try {
      const sides = await readSides(tab.spec)
      if (
        loaded.modified.isDisposed() ||
        loaded.modified.getAlternativeVersionId() !== before
      ) {
        return
      }
      const disk = sides[1]
      if (sides[0] === null || disk === null) {
        update(id, { status: 'binary' })
        return
      }
      if (loaded.original !== null) {
        replaceText(loaded.original, sides[0])
      }
      syncing.add(loaded.modified)
      replaceText(loaded.modified, disk)
      syncing.delete(loaded.modified)
      const version = loaded.modified.getAlternativeVersionId()
      if (version !== before || disk !== loaded.base) {
        commit({
          tabs: latest.current.tabs.map((item) =>
            item.document.status === 'text' &&
            item.document.modified === loaded.modified
              ? {
                  ...item,
                  document: {
                    ...item.document,
                    saved: version,
                    base: disk,
                  },
                }
              : item
          ),
        })
      }
    } catch (caught) {
      update(id, { status: 'error', message: errorMessage(caught) })
    }
  }

  async function open(spec: TabSpec) {
    commit({ active: spec.id })
    if (latest.current.tabs.some((tab) => tab.spec.id === spec.id)) {
      return
    }
    commit({
      tabs: [...latest.current.tabs, { spec, document: { status: 'loading' } }],
    })
    await load(spec)
  }

  async function load(spec: TabSpec) {
    const loaded = await read(spec)
    const waiting = latest.current.tabs.some(
      (item) => item.spec.id === spec.id && item.document.status === 'loading'
    )
    if (!mounted.current || !waiting) {
      for (const model of documentModels(loaded)) {
        model.dispose()
      }
      return
    }
    update(spec.id, loaded)
  }

  function save(id: string, overwrite: boolean) {
    const result = writes.current.then(() => write(id, overwrite))
    writes.current = result
    return result
  }

  async function write(id: string, overwrite: boolean) {
    const tab = latest.current.tabs.find((item) => item.spec.id === id)
    if (
      tab?.document.status !== 'text' ||
      !tab.document.dirty ||
      tab.document.modified.isDisposed() ||
      tab.spec.right.kind !== 'worktree' ||
      tab.spec.preview === true
    ) {
      return true
    }
    const saving = tab.document.modified
    const version = saving.getAlternativeVersionId()
    const content = saving.getValue()
    try {
      const written = await call(props.machine, 'files.write', {
        projectId: props.projectId,
        path: tab.spec.path,
        content,
        base: overwrite ? null : tab.document.base,
      })
      if (!written) {
        setConflict(tab.spec)
        return false
      }
    } catch (caught) {
      showError(caught)
      return false
    }
    commit({
      tabs: latest.current.tabs.map((item) =>
        item.document.status === 'text' && item.document.modified === saving
          ? {
              ...item,
              document: {
                ...item.document,
                saved: version,
                dirty: saving.getAlternativeVersionId() !== version,
                base: content,
              },
            }
          : item
      ),
    })
    props.onSaved()
    return true
  }

  function removeTabs(match: (spec: TabSpec) => boolean) {
    const current = latest.current
    const next = current.tabs.filter((tab) => !match(tab.spec))
    const index = current.tabs.findIndex(
      (tab) => tab.spec.id === current.active
    )
    commit({
      tabs: next,
      active:
        index !== -1 && match(current.tabs[index].spec)
          ? (next.at(Math.min(index, next.length - 1))?.spec.id ?? null)
          : current.active,
    })
  }

  function renamed(from: string, to: string) {
    function rename(path: string) {
      if (path === from) {
        return to
      }
      if (path.startsWith(`${from}/`)) {
        return `${to}${path.slice(from.length)}`
      }
      return path
    }
    const current = latest.current
    const next = current.tabs.map((tab) => {
      if (tab.spec.id === fileTab(tab.spec.repo, tab.spec.path).id) {
        return { ...tab, spec: fileTab(tab.spec.repo, rename(tab.spec.path)) }
      }
      if (tab.spec.id === previewTab(tab.spec.repo, tab.spec.path).id) {
        return {
          ...tab,
          spec: previewTab(tab.spec.repo, rename(tab.spec.path)),
        }
      }
      return tab
    })
    const index = current.tabs.findIndex(
      (tab) => tab.spec.id === current.active
    )
    commit({
      tabs: next,
      active: index === -1 ? current.active : next[index].spec.id,
    })
  }

  function deleted(path: string) {
    removeTabs(
      (spec) =>
        spec.right.kind === 'worktree' &&
        (spec.path === path || spec.path.startsWith(`${path}/`))
    )
  }

  function close(id: string) {
    if (dirty.some((tab) => tab.spec.id === id)) {
      setClosing({ kind: 'tab', id })
      return
    }
    removeTabs((spec) => spec.id === id)
  }

  function requestClose() {
    if (dirty.length > 0) {
      setClosing({ kind: 'dialog' })
      return
    }
    props.onClose()
  }

  async function finish(saving: boolean) {
    if (closing === null) {
      return
    }
    setClosing(null)
    if (
      saving &&
      (
        await Promise.all(closingTabs.map((tab) => save(tab.spec.id, false)))
      ).includes(false)
    ) {
      return
    }
    if (closing.kind === 'tab') {
      removeTabs((spec) => spec.id === closing.id)
    }
    if (closing.kind === 'dialog') {
      props.onClose()
    }
  }

  function overwrite() {
    if (conflict !== null) {
      void save(conflict.id, true)
    }
    setConflict(null)
  }

  const restore = useEffectEvent(() => {
    for (const tab of props.saved.tabs) {
      void load(tab.spec)
    }
  })

  useEffect(() => restore(), [])

  return {
    tabs,
    active,
    setActive,
    dirty,
    closing,
    setClosing,
    closingTabs,
    conflict: {
      path: conflict?.path ?? null,
      onCancel: () => setConflict(null),
      onOverwrite: overwrite,
    },
    open,
    reload,
    save,
    close,
    renamed,
    deleted,
    requestClose,
    finish,
    releaseModels,
  }
}

function documentModels(document: Document) {
  if (document.status !== 'text') {
    return []
  }
  return document.original === null
    ? [document.modified]
    : [document.original, document.modified]
}

function replaceText(model: monaco.editor.ITextModel, text: string) {
  const old = model.getValue()
  let start = 0
  while (
    start < old.length &&
    start < text.length &&
    old[start] === text[start]
  ) {
    start++
  }
  let end = 0
  while (
    end < old.length - start &&
    end < text.length - start &&
    old[old.length - 1 - end] === text[text.length - 1 - end]
  ) {
    end++
  }
  if (start === old.length && start === text.length) {
    return
  }
  model.applyEdits([
    {
      range: monaco.Range.fromPositions(
        model.getPositionAt(start),
        model.getPositionAt(old.length - end)
      ),
      text: text.slice(start, text.length - end),
    },
  ])
}
