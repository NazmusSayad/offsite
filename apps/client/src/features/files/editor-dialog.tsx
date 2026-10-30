import { PanelLeftIcon, ViewIcon, XIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { SourceControlRepo } from '@offsite/core/git'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DocumentNotice } from '@/features/files/document-notice'
import { EditorErrors } from '@/features/files/editor-errors'
import {
  type EditorSettings,
  loadEditorState,
  saveEditorState,
} from '@/features/files/editor-state'
import { EditorTabs } from '@/features/files/editor-tabs'
import { Explorer } from '@/features/files/explorer'
import { MarkdownPreview } from '@/features/files/markdown-preview'
import {
  applyTheme,
  editorOptions,
  loadEditorFont,
  monaco,
} from '@/features/files/monaco'
import { SavePrompt } from '@/features/files/save-prompt'
import { StatusBar } from '@/features/files/status-bar'
import { useBlockStaging } from '@/features/files/use-block-staging'
import { useEditorHosts } from '@/features/files/use-editor-hosts'
import { useTabs } from '@/features/files/use-tabs'
import { ViewSwitcher } from '@/features/files/view-switcher'
import { BranchDialog } from '@/features/git/branch-picker'
import {
  fileTab,
  previewTab,
  type TabSpec,
} from '@/features/source-control/changes'
import { DiffToolbar } from '@/features/source-control/diff-toolbar'
import { GitStatus } from '@/features/source-control/git-status'
import { SourceControlView } from '@/features/source-control/source-control-view'
import { useRepos } from '@/features/source-control/use-repos'
import { projectOf, showError, useStore } from '@/lib/store'
import { useCodeTheme } from '@/lib/theme'
import { cn, drag } from '@/lib/utils'

const ZoomableImage = lazy(async () => ({
  default: (await import('@/components/zoomable-image')).ZoomableImage,
}))

export function EditorDialog(props: {
  machine: string
  projectId: string
  onClose: () => void
}) {
  const project = useStore((state) =>
    projectOf(state, props.machine, props.projectId)
  )
  const codeTheme = useCodeTheme()
  const prefs = useStore((state) => state.prefs.editor)
  const [saved] = useState(() =>
    loadEditorState(props.machine, props.projectId)
  )
  const [views] = useState(
    () => new Map(saved.tabs.map((tab) => [tab.spec.id, tab.view]))
  )
  const [settings, setSettings] = useState(() => ({
    ...saved.settings,
    width: Math.min(saved.settings.width, window.innerWidth * 0.6),
  }))
  const [expanded, setExpanded] = useState(saved.expanded)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(0)
  const [checkout, setCheckout] = useState<SourceControlRepo | null>(null)
  const hosts = useEditorHosts()
  const editor = hosts.editor
  const diff = hosts.diff
  const shown = useRef<{
    id: string
    editor: monaco.editor.IStandaloneCodeEditor
  } | null>(null)
  const refresh = useCallback(() => setVersion((count) => count + 1), [])
  const documents = useTabs({
    machine: props.machine,
    projectId: props.projectId,
    saved,
    onSaved: refresh,
    onClose: () => {
      persist()
      props.onClose()
    },
  })

  const active = documents.active

  function reloadActive() {
    if (active !== null) {
      void documents.reload(active)
    }
  }

  const status = useRepos({
    machine: props.machine,
    projectId: props.projectId,
    version,
    onLoaded: reloadActive,
  })
  const repos = status.repos
  const current = documents.tabs.find((tab) => tab.spec.id === active)
  const text =
    current?.document.status === 'text' && current.spec.preview !== true
      ? current.document
      : null
  const previewed =
    current?.document.status === 'text' && current.spec.preview === true
      ? current.document.modified
      : null
  const original = text?.original ?? null
  const modified = text?.modified ?? null
  const editable = current?.spec.right.kind === 'worktree'
  const repo =
    repos?.find((item) => item.path === current?.spec.repo) ??
    repos?.at(0) ??
    null
  const markdown =
    original === null && modified?.getLanguageId() === 'markdown'
      ? modified
      : null

  useEffect(() => {
    applyTheme().catch(showError)
  }, [codeTheme])

  useEffect(() => {
    editor?.updateOptions(editorOptions(prefs))
    diff?.updateOptions(editorOptions(prefs))
    loadEditorFont(prefs).catch(showError)
  }, [editor, diff, prefs])

  useEffect(() => {
    diff?.updateOptions({
      renderSideBySide: !settings.inline,
      ignoreTrimWhitespace: !settings.whitespace,
      hideUnchangedRegions: { enabled: settings.collapse },
    })
  }, [diff, settings.inline, settings.whitespace, settings.collapse])

  useEffect(() => {
    if (editor === null || diff === null) {
      return
    }
    if (shown.current !== null) {
      views.set(shown.current.id, shown.current.editor.saveViewState())
    }
    shown.current = null
    editor.setModel(original === null ? modified : null)
    diff.setModel(
      original === null || modified === null ? null : { original, modified }
    )
    if (modified === null || active === null) {
      return
    }
    const target = original === null ? editor : diff.getModifiedEditor()
    target.updateOptions({ readOnly: !editable })
    diff.updateOptions({ readOnly: !editable })
    target.restoreViewState(views.get(active) ?? null)
    target.focus()
    shown.current = { id: active, editor: target }
  }, [editor, diff, original, modified, active, editable, views])

  const refreshActive = useEffectEvent(reloadActive)

  useEffect(() => refreshActive(), [active])

  useBlockStaging({
    machine: props.machine,
    projectId: props.projectId,
    spec: current?.spec,
    original,
    modified,
    onPerform: perform,
  })

  function open(spec: TabSpec) {
    if (window.innerWidth < 640) {
      change({ sidebar: false })
    }
    void documents.open(spec)
  }

  async function perform(task: () => Promise<unknown>) {
    setBusy((count) => count + 1)
    try {
      await task()
    } catch (caught) {
      showError(caught)
    } finally {
      setBusy((count) => count - 1)
      refresh()
    }
  }

  function change(update: Partial<EditorSettings>) {
    setSettings((value) => ({ ...value, ...update }))
  }

  function persist() {
    if (shown.current !== null) {
      views.set(shown.current.id, shown.current.editor.saveViewState())
    }
    saveEditorState(props.machine, props.projectId, {
      tabs: documents.tabs.map((tab) => ({
        spec: tab.spec,
        view: views.get(tab.spec.id) ?? null,
      })),
      active,
      expanded,
      settings,
    })
  }

  useEffect(persist)

  const toggle = (
    <Button
      size="icon-micro"
      variant="ghost"
      title="Toggle Primary Side Bar"
      aria-label="Toggle Primary Side Bar"
      aria-pressed={settings.sidebar}
      onClick={() => change({ sidebar: !settings.sidebar })}
    >
      <HugeiconsIcon icon={PanelLeftIcon} className="size-4" />
    </Button>
  )

  const header = (
    <>
      {toggle}
      <ViewSwitcher view={settings.view} onView={(view) => change({ view })} />
    </>
  )

  return (
    <Dialog open onOpenChange={() => documents.requestClose()}>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-dvw max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 's') {
            event.preventDefault()
            if (active !== null) {
              void documents.save(active)
            }
          }
          if ((event.metaKey || event.ctrlKey) && event.key === 'w') {
            event.preventDefault()
            if (active !== null) {
              documents.close(active)
            }
          }
          if (
            (event.metaKey || event.ctrlKey) &&
            event.shiftKey &&
            event.key.toLowerCase() === 'v' &&
            markdown !== null
          ) {
            event.preventDefault()
            change({ preview: !settings.preview })
          }
        }}
      >
        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              'border-sidebar-border relative shrink-0 border-r',
              !settings.sidebar && 'hidden'
            )}
            style={{ width: settings.width }}
          >
            {settings.view === 'explorer' && (
              <Explorer
                machine={props.machine}
                projectId={props.projectId}
                root={project?.path ?? ''}
                header={header}
                expanded={expanded}
                onExpanded={setExpanded}
                active={current?.spec.path ?? null}
                onOpen={(path) => open(fileTab('', path))}
                onPreview={(path) => open(previewTab('', path))}
                onRenamed={documents.renamed}
                onDeleted={documents.deleted}
              />
            )}
            {settings.view === 'scm' && (
              <SourceControlView
                machine={props.machine}
                projectId={props.projectId}
                name={project?.name ?? ''}
                root={project?.path ?? ''}
                header={header}
                repos={repos}
                error={status.error}
                busy={busy > 0}
                settings={settings}
                onSettings={change}
                onMessage={(path, message) =>
                  setSettings((value) => ({
                    ...value,
                    messages: { ...value.messages, [path]: message },
                  }))
                }
                active={active}
                onOpen={open}
                onRefresh={refresh}
                onPerform={perform}
                onCheckout={setCheckout}
              />
            )}
            <div
              role="separator"
              aria-orientation="vertical"
              className="hover:bg-primary absolute inset-y-0 -right-0.5 z-10 w-1 cursor-col-resize touch-none transition-colors delay-100"
              onPointerDown={(event) =>
                drag(event, (move) =>
                  change({
                    width: Math.min(
                      Math.max(move.clientX, 200),
                      window.innerWidth - 240
                    ),
                  })
                )
              }
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="bg-sidebar flex h-9 shrink-0 items-center shadow-[inset_0_-1px_0_var(--sidebar-border)]">
              {!settings.sidebar && (
                <div className="shrink-0 px-1.5">{toggle}</div>
              )}
              <DialogTitle className="sr-only">Editor</DialogTitle>
              <EditorTabs
                tabs={documents.tabs.map((tab) => ({
                  id: tab.spec.id,
                  path: tab.spec.path,
                  label: tab.spec.label,
                }))}
                active={active}
                dirty={documents.dirty.map((tab) => tab.spec.id)}
                onSelect={documents.setActive}
                onClose={documents.close}
              />
              {current !== undefined && original !== null && (
                <DiffToolbar
                  settings={settings}
                  onSettings={change}
                  onOpenFile={() =>
                    open(fileTab(current.spec.repo, current.spec.path))
                  }
                  onPrevious={() => diff?.goToDiff('previous')}
                  onNext={() => diff?.goToDiff('next')}
                />
              )}
              {markdown !== null && (
                <Button
                  size="icon-micro"
                  variant="ghost"
                  className="ml-1.5 shrink-0"
                  title="Toggle Preview"
                  aria-label="Toggle Preview"
                  aria-pressed={settings.preview}
                  onClick={() => change({ preview: !settings.preview })}
                >
                  <HugeiconsIcon icon={ViewIcon} className="size-4" />
                </Button>
              )}
              <Button
                size="icon-micro"
                variant="ghost"
                className="mx-1.5 shrink-0"
                title="Close"
                aria-label="Close"
                onClick={documents.requestClose}
              >
                <HugeiconsIcon icon={XIcon} className="size-4" />
              </Button>
            </div>
            <div className="flex min-h-0 flex-1">
              <div
                className={cn(
                  'relative min-w-0 flex-1',
                  markdown !== null && settings.preview && 'max-sm:hidden',
                  previewed !== null && 'hidden'
                )}
              >
                <div
                  ref={hosts.codeHost}
                  className={cn(
                    'absolute inset-0',
                    (modified === null || original !== null) && 'hidden'
                  )}
                />
                <div
                  ref={hosts.diffHost}
                  className={cn(
                    'absolute inset-0',
                    (modified === null || original === null) && 'hidden'
                  )}
                />
                {current?.document.status === 'image' && (
                  <Suspense>
                    <ZoomableImage
                      src={current.document.src}
                      alt={current.spec.path}
                    />
                  </Suspense>
                )}
                <DocumentNotice
                  document={current?.document}
                  view={settings.view}
                />
              </div>
              {markdown !== null &&
                settings.preview &&
                editor !== null &&
                current !== undefined && (
                  <MarkdownPreview
                    machine={props.machine}
                    projectId={props.projectId}
                    path={current.spec.path}
                    model={markdown}
                    editor={editor}
                    onOpen={(path) => open(fileTab('', path))}
                  />
                )}
              {previewed !== null && current !== undefined && (
                <MarkdownPreview
                  key={current.spec.id}
                  machine={props.machine}
                  projectId={props.projectId}
                  path={current.spec.path}
                  model={previewed}
                  editor={null}
                  onOpen={(path) => open(fileTab('', path))}
                />
              )}
            </div>
          </div>
        </div>
        <StatusBar
          editor={
            modified === null
              ? null
              : original === null
                ? editor
                : (diff?.getModifiedEditor() ?? null)
          }
          language={text?.language ?? null}
        >
          {repo !== null && (
            <GitStatus
              repo={repo}
              busy={busy > 0}
              onCheckout={() => setCheckout(repo)}
              onSync={() =>
                void perform(() =>
                  call(props.machine, 'git.sync', {
                    projectId: props.projectId,
                    repo: repo.path,
                  })
                )
              }
              onPublish={() =>
                void perform(() =>
                  call(props.machine, 'git.push', {
                    projectId: props.projectId,
                    repo: repo.path,
                  })
                )
              }
            />
          )}
        </StatusBar>
        <EditorErrors />
        <SavePrompt
          open={documents.closing !== null}
          paths={documents.closingTabs.map((tab) => tab.spec.path)}
          onCancel={() => documents.setClosing(null)}
          onFinish={(saving) => void documents.finish(saving)}
        />
        {checkout !== null && (
          <BranchDialog
            machine={props.machine}
            projectId={props.projectId}
            repo={{
              ...checkout,
              changed:
                checkout.merge.length +
                checkout.staged.length +
                checkout.changes.length,
            }}
            onRefresh={refresh}
            onClose={() => setCheckout(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
