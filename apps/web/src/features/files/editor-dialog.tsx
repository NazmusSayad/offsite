import { PanelLeftIcon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { call } from '@/api/connection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { EditorTabs } from '@/features/files/editor-tabs'
import { baseName, Explorer } from '@/features/files/explorer'
import { applyTheme, loadLanguage, monaco } from '@/features/files/monaco'
import { StatusBar } from '@/features/files/status-bar'
import { projectOf, showError, useStore } from '@/lib/store'
import { useCodeTheme } from '@/lib/theme'
import { cn, drag, errorMessage } from '@/lib/utils'

const ZoomableImage = lazy(async () => ({
  default: (await import('@/components/zoomable-image')).ZoomableImage,
}))

type Document =
  | { status: 'loading' }
  | {
      status: 'text'
      model: monaco.editor.ITextModel
      language: string
      saved: number
      dirty: boolean
    }
  | { status: 'image'; src: string }
  | { status: 'large'; size: number; limit: number }
  | { status: 'binary'; size: number }
  | { status: 'error'; message: string }

type Tab = { path: string; pinned: boolean; document: Document }

type Closing = { kind: 'tab'; path: string } | { kind: 'dialog' }

const viewStates = new WeakMap<
  monaco.editor.ITextModel,
  monaco.editor.ICodeEditorViewState | null
>()

export function EditorDialog(props: {
  machine: string
  projectId: string
  onClose: () => void
}) {
  const project = useStore((state) =>
    projectOf(state, props.machine, props.projectId)
  )
  const codeTheme = useCodeTheme()
  const [tabs, setTabs] = useState<Tab[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [sidebar, setSidebar] = useState(true)
  const [width, setWidth] = useState(() =>
    Math.min(260, window.innerWidth * 0.6)
  )
  const [closing, setClosing] = useState<Closing | null>(null)
  const [editor, setEditor] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null)
  const host = useCallback((element: HTMLDivElement | null) => {
    if (element === null) {
      return
    }
    const instance = monaco.editor.create(element, {
      automaticLayout: true,
      fontFamily: getComputedStyle(document.documentElement).getPropertyValue(
        '--font-mono'
      ),
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: false },
      model: null,
    })
    setEditor(instance)
    return () => {
      instance.dispose()
      for (const item of monaco.editor.getModels()) {
        item.dispose()
      }
    }
  }, [])

  const current = tabs.find((tab) => tab.path === active)
  const model =
    current?.document.status === 'text' ? current.document.model : null
  const dirty = tabs
    .filter((tab) => tab.document.status === 'text' && tab.document.dirty)
    .map((tab) => tab.path)
  const closingPaths = closing?.kind === 'tab' ? [closing.path] : dirty

  useEffect(() => {
    applyTheme().catch(showError)
  }, [codeTheme])

  useEffect(() => {
    if (editor === null) {
      return
    }
    const previous = editor.getModel()
    if (previous !== null) {
      viewStates.set(previous, editor.saveViewState())
    }
    editor.setModel(model)
    if (model !== null) {
      editor.restoreViewState(viewStates.get(model) ?? null)
      editor.focus()
    }
  }, [editor, model])

  useEffect(() => {
    const models = new Set(
      tabs.flatMap((tab) =>
        tab.document.status === 'text' ? [tab.document.model] : []
      )
    )
    for (const item of monaco.editor.getModels()) {
      if (!models.has(item)) {
        item.dispose()
      }
    }
  }, [tabs])

  async function read(path: string): Promise<Document> {
    try {
      const result = await call(props.machine, 'files.read', {
        projectId: props.projectId,
        path,
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
        return { status: 'binary', size: result.size }
      }
      const language = await loadLanguage(path)
      const created = monaco.editor.createModel(result.content, language.id)
      created.onDidChangeContent(() =>
        setTabs((items) => {
          const tab = items.find(
            (item) =>
              item.document.status === 'text' && item.document.model === created
          )
          if (tab === undefined || tab.document.status !== 'text') {
            return items
          }
          const changed =
            created.getAlternativeVersionId() !== tab.document.saved
          if (tab.document.dirty === changed && tab.pinned) {
            return items
          }
          return items.map((item) =>
            item === tab
              ? {
                  ...tab,
                  pinned: true,
                  document: { ...tab.document, dirty: changed },
                }
              : item
          )
        })
      )
      return {
        status: 'text',
        model: created,
        language: language.name,
        saved: created.getAlternativeVersionId(),
        dirty: false,
      }
    } catch (caught) {
      return { status: 'error', message: errorMessage(caught) }
    }
  }

  async function open(path: string, pinned: boolean) {
    if (window.innerWidth < 640) {
      setSidebar(false)
    }
    setActive(path)
    if (tabs.some((tab) => tab.path === path)) {
      if (pinned) {
        setTabs(
          tabs.map((tab) => (tab.path === path ? { ...tab, pinned } : tab))
        )
      }
      return
    }
    const preview = tabs.find((tab) => !tab.pinned)
    const tab: Tab = { path, pinned, document: { status: 'loading' } }
    setTabs(
      preview === undefined || pinned
        ? [...tabs, tab]
        : tabs.map((item) => (item === preview ? tab : item))
    )
    const loaded = await read(path)
    setTabs((items) =>
      items.map((item) =>
        item.path === path && item.document.status === 'loading'
          ? { ...item, document: loaded }
          : item
      )
    )
  }

  async function save(path: string) {
    const tab = tabs.find((item) => item.path === path)
    if (tab === undefined || tab.document.status !== 'text') {
      return true
    }
    const saving = tab.document.model
    const version = saving.getAlternativeVersionId()
    try {
      await call(props.machine, 'files.write', {
        projectId: props.projectId,
        path,
        content: saving.getValue(),
      })
    } catch (caught) {
      showError(caught)
      return false
    }
    setTabs((items) =>
      items.map((item) =>
        item.document.status === 'text' && item.document.model === saving
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
    return true
  }

  function removeTabs(match: (path: string) => boolean) {
    const next = tabs.filter((tab) => !match(tab.path))
    setTabs(next)
    if (active !== null && match(active)) {
      const index = tabs.findIndex((tab) => tab.path === active)
      setActive(next.at(Math.min(index, next.length - 1))?.path ?? null)
    }
  }

  function close(path: string) {
    const tab = tabs.find((item) => item.path === path)
    if (tab?.document.status === 'text' && tab.document.dirty) {
      setClosing({ kind: 'tab', path })
      return
    }
    removeTabs((item) => item === path)
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
    if (saving && (await Promise.all(closingPaths.map(save))).includes(false)) {
      return
    }
    if (closing.kind === 'tab') {
      removeTabs((item) => item === closing.path)
    }
    if (closing.kind === 'dialog') {
      props.onClose()
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
    setTabs(tabs.map((tab) => ({ ...tab, path: rename(tab.path) })))
    if (active !== null) {
      setActive(rename(active))
    }
  }

  const toggle = (
    <Button
      size="icon-micro"
      variant="ghost"
      title="Toggle Explorer"
      aria-label="Toggle Explorer"
      aria-pressed={sidebar}
      onClick={() => setSidebar(!sidebar)}
    >
      <HugeiconsIcon icon={PanelLeftIcon} className="size-4" />
    </Button>
  )

  return (
    <Dialog open onOpenChange={() => requestClose()}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-dvw max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 's') {
            event.preventDefault()
            if (active !== null) {
              void save(active)
            }
          }
        }}
      >
        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              'border-sidebar-border relative shrink-0 border-r',
              !sidebar && 'hidden'
            )}
            style={{ width }}
          >
            <Explorer
              machine={props.machine}
              projectId={props.projectId}
              name={project?.name ?? ''}
              root={project?.path ?? ''}
              toggle={toggle}
              active={active}
              onOpen={(path, pinned) => void open(path, pinned)}
              onRenamed={renamed}
              onDeleted={(path) =>
                removeTabs(
                  (item) => item === path || item.startsWith(`${path}/`)
                )
              }
            />
            <div
              role="separator"
              aria-orientation="vertical"
              className="hover:bg-primary absolute inset-y-0 -right-0.5 z-10 w-1 cursor-col-resize touch-none transition-colors delay-100"
              onPointerDown={(event) =>
                drag(event, (move) =>
                  setWidth(
                    Math.min(
                      Math.max(move.clientX, 160),
                      window.innerWidth - 240
                    )
                  )
                )
              }
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="bg-sidebar flex h-9 shrink-0 items-center shadow-[inset_0_-1px_0_var(--sidebar-border)]">
              {!sidebar && <div className="shrink-0 px-1.5">{toggle}</div>}
              <DialogTitle className="sr-only">
                {project?.name ?? ''}
              </DialogTitle>
              <EditorTabs
                tabs={tabs}
                active={active}
                dirty={dirty}
                onSelect={setActive}
                onPin={(path) => void open(path, true)}
                onClose={close}
              />
              <Button
                size="icon-micro"
                variant="ghost"
                className="mx-1.5 shrink-0"
                title="Close"
                aria-label="Close"
                onClick={requestClose}
              >
                <HugeiconsIcon icon={XIcon} className="size-4" />
              </Button>
            </div>
            <div className="relative min-h-0 flex-1">
              <div
                ref={host}
                className={cn('absolute inset-0', model === null && 'hidden')}
              />
              {current === undefined && (
                <p className="text-muted-foreground grid size-full place-items-center p-6 text-center text-sm">
                  Open a file from the explorer to start editing.
                </p>
              )}
              {current?.document.status === 'image' && (
                <Suspense>
                  <ZoomableImage
                    src={current.document.src}
                    alt={current.path}
                  />
                </Suspense>
              )}
              {current?.document.status === 'large' && (
                <p className="text-muted-foreground grid size-full place-items-center p-6 text-center text-sm">
                  This file is {formatSize(current.document.size)}, too large to
                  open in the editor (limit {formatSize(current.document.limit)}
                  ).
                </p>
              )}
              {current?.document.status === 'binary' && (
                <p className="text-muted-foreground grid size-full place-items-center p-6 text-center text-sm">
                  The file is not displayed in the editor because it is binary.
                </p>
              )}
              {current?.document.status === 'error' && (
                <p className="text-muted-foreground grid size-full place-items-center p-6 text-center text-sm">
                  {current.document.message}
                </p>
              )}
            </div>
          </div>
        </div>
        <StatusBar
          editor={editor}
          language={
            current?.document.status === 'text'
              ? current.document.language
              : null
          }
        />
        <AlertDialog
          open={closing !== null}
          onOpenChange={(open) => {
            if (!open) {
              setClosing(null)
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {closingPaths.length === 1
                  ? `Do you want to save the changes you made to ${baseName(closingPaths[0])}?`
                  : `Do you want to save the changes to the following ${closingPaths.length} files?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {closingPaths.length > 1 &&
                  `${closingPaths.map(baseName).join(', ')}. `}
                {"Your changes will be lost if you don't save them."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="outline"
                onClick={() => void finish(false)}
              >
                {"Don't Save"}
              </AlertDialogAction>
              <AlertDialogAction onClick={() => void finish(true)}>
                {closingPaths.length === 1 ? 'Save' : 'Save All'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
