import { useEffect, useEffectEvent, useState } from 'react'
import { call } from '@/api/connection'
import type { EditorState } from '@/features/files/editor-state'
import { loadLanguage, monaco } from '@/features/files/monaco'
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
    }
  | { status: 'image'; src: string }
  | { status: 'large'; size: number; limit: number }
  | { status: 'binary' }
  | { status: 'error'; message: string }

type Tab = { spec: TabSpec; document: Document }

type Closing = { kind: 'tab'; id: string } | { kind: 'dialog' }

const syncing = new WeakSet<monaco.editor.ITextModel>()

export function useTabs(props: {
  machine: string
  projectId: string
  saved: EditorState
  onSaved: () => void
  onClose: () => void
}) {
  const [tabs, setTabs] = useState<Tab[]>(() =>
    props.saved.tabs.map((tab) => ({
      spec: tab.spec,
      document: { status: 'loading' },
    }))
  )
  const [active, setActive] = useState(props.saved.active)
  const [closing, setClosing] = useState<Closing | null>(null)
  const dirty = tabs.filter(
    (tab) => tab.document.status === 'text' && tab.document.dirty
  )
  const closingTabs =
    closing?.kind === 'tab'
      ? tabs.filter((tab) => tab.spec.id === closing.id)
      : dirty

  useEffect(() => {
    const models = new Set(
      tabs.flatMap((tab) =>
        tab.document.status === 'text'
          ? [tab.document.modified, tab.document.original]
          : []
      )
    )
    for (const item of monaco.editor.getModels()) {
      if (!models.has(item)) {
        item.dispose()
      }
    }
  }, [tabs])

  useEffect(
    () => () => {
      for (const item of monaco.editor.getModels()) {
        item.dispose()
      }
    },
    []
  )

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
    setTabs((items) =>
      items.map((item) => (item.spec.id === id ? { ...item, document } : item))
    )
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
      setTabs((items) => {
        const tab = items.find(
          (item) =>
            item.document.status === 'text' && item.document.modified === right
        )
        if (tab === undefined || tab.document.status !== 'text') {
          return items
        }
        const changed = right.getAlternativeVersionId() !== tab.document.saved
        if (tab.document.dirty === changed) {
          return items
        }
        return items.map((item) =>
          item === tab
            ? { ...tab, document: { ...tab.document, dirty: changed } }
            : item
        )
      })
    })
    return {
      status: 'text',
      original: left,
      modified: right,
      language: language.name,
      saved: right.getAlternativeVersionId(),
      dirty: false,
    }
  }

  async function reload(id: string) {
    const tab = tabs.find((item) => item.spec.id === id)
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
      if (sides[0] === null || sides[1] === null) {
        update(id, { status: 'binary' })
        return
      }
      if (loaded.original !== null) {
        replaceText(loaded.original, sides[0])
      }
      syncing.add(loaded.modified)
      replaceText(loaded.modified, sides[1])
      syncing.delete(loaded.modified)
      const version = loaded.modified.getAlternativeVersionId()
      if (version !== before) {
        setTabs((items) =>
          items.map((item) =>
            item.document.status === 'text' &&
            item.document.modified === loaded.modified
              ? { ...item, document: { ...item.document, saved: version } }
              : item
          )
        )
      }
    } catch (caught) {
      update(id, { status: 'error', message: errorMessage(caught) })
    }
  }

  async function open(spec: TabSpec) {
    setActive(spec.id)
    if (tabs.some((tab) => tab.spec.id === spec.id)) {
      return
    }
    setTabs([...tabs, { spec, document: { status: 'loading' } }])
    await load(spec)
  }

  async function load(spec: TabSpec) {
    const loaded = await read(spec)
    setTabs((items) =>
      items.map((item) =>
        item.spec.id === spec.id && item.document.status === 'loading'
          ? { ...item, document: loaded }
          : item
      )
    )
  }

  async function save(id: string) {
    const tab = tabs.find((item) => item.spec.id === id)
    if (
      tab?.document.status !== 'text' ||
      tab.spec.right.kind !== 'worktree' ||
      tab.spec.preview === true
    ) {
      return true
    }
    const saving = tab.document.modified
    const version = saving.getAlternativeVersionId()
    try {
      await call(props.machine, 'files.write', {
        projectId: props.projectId,
        path: tab.spec.path,
        content: saving.getValue(),
      })
    } catch (caught) {
      showError(caught)
      return false
    }
    setTabs((items) =>
      items.map((item) =>
        item.document.status === 'text' && item.document.modified === saving
          ? {
              ...item,
              document: {
                ...item.document,
                saved: version,
                dirty: saving.getAlternativeVersionId() !== version,
              },
            }
          : item
      )
    )
    props.onSaved()
    return true
  }

  function removeTabs(match: (spec: TabSpec) => boolean) {
    const next = tabs.filter((tab) => !match(tab.spec))
    setTabs(next)
    const index = tabs.findIndex((tab) => tab.spec.id === active)
    if (index !== -1 && match(tabs[index].spec)) {
      setActive(next.at(Math.min(index, next.length - 1))?.spec.id ?? null)
    }
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
    const next = tabs.map((tab) => {
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
    setTabs(next)
    const index = tabs.findIndex((tab) => tab.spec.id === active)
    if (index !== -1) {
      setActive(next[index].spec.id)
    }
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
      (await Promise.all(closingTabs.map((tab) => save(tab.spec.id)))).includes(
        false
      )
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
    open,
    reload,
    save,
    close,
    renamed,
    deleted,
    requestClose,
    finish,
  }
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
