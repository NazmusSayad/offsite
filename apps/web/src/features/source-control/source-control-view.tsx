import {
  CheckIcon,
  ListTreeIcon,
  ListViewIcon,
  RefreshCwIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  GitAction,
  GitResource,
  SourceControlRepo,
} from '@offsite/core/git'
import { type ReactNode, useState } from 'react'
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
import type { EditorSettings } from '@/features/files/editor-state'
import { baseName } from '@/features/files/explorer'
import { shortHash, type TabSpec } from '@/features/source-control/changes'
import {
  CommitBox,
  type CommitOptions,
  commitDefaults,
} from '@/features/source-control/commit-box'
import { Graph } from '@/features/source-control/graph'
import { MoreActions } from '@/features/source-control/more-actions'
import {
  ResourceGroups,
  RowAction,
} from '@/features/source-control/resource-groups'
import { showError } from '@/lib/store'

type Discarding = { repo: SourceControlRepo; resources: GitResource[] }

export function SourceControlView(props: {
  machine: string
  projectId: string
  name: string
  root: string
  header: ReactNode
  repos: SourceControlRepo[] | null
  error: string | null
  busy: boolean
  settings: EditorSettings
  onSettings: (change: Partial<EditorSettings>) => void
  onMessage: (repo: string, message: string) => void
  active: string | null
  onOpen: (spec: TabSpec, pinned: boolean) => void
  onRefresh: () => void
  onPerform: (task: () => Promise<unknown>) => Promise<void>
  onCheckout: (repo: SourceControlRepo) => void
}) {
  const [generating, setGenerating] = useState<string[]>([])
  const [prompt, setPrompt] = useState<{
    repo: SourceControlRepo
    options: CommitOptions
  } | null>(null)
  const [discarding, setDiscarding] = useState<Discarding | null>(null)
  const repos = props.repos ?? []
  const single = repos.length === 1 ? repos[0] : null
  const settings = props.settings

  function message(repo: SourceControlRepo) {
    return settings.messages[repo.path] ?? ''
  }

  function run(repo: SourceControlRepo, action: GitAction) {
    return props.onPerform(() =>
      call(props.machine, 'git.run', {
        projectId: props.projectId,
        repo: repo.path,
        action,
      })
    )
  }

  function remote(repo: SourceControlRepo, method: 'git.push' | 'git.sync') {
    return props.onPerform(() =>
      call(props.machine, method, {
        projectId: props.projectId,
        repo: repo.path,
      })
    )
  }

  async function commit(repo: SourceControlRepo, options: CommitOptions) {
    const text = message(repo).trim()
    if (text === '' && !options.amend) {
      showError('Please provide a commit message.')
      return
    }
    const unstaged = repo.changes.length + repo.merge.length > 0
    if (options.all === null && !options.amend && repo.staged.length === 0) {
      if (!unstaged) {
        showError('There are no changes to commit.')
        return
      }
      if (!settings.smartCommit) {
        setPrompt({ repo, options })
        return
      }
    }
    const all =
      options.all ?? (repo.staged.length === 0 && !options.amend && unstaged)
    await props.onPerform(async () => {
      await call(props.machine, 'git.run', {
        projectId: props.projectId,
        repo: repo.path,
        action: { kind: 'commit', message: text, all, amend: options.amend },
      })
      props.onMessage(repo.path, '')
      if (options.then !== null) {
        await call(
          props.machine,
          options.then === 'push' ? 'git.push' : 'git.sync',
          { projectId: props.projectId, repo: repo.path }
        )
      }
    })
  }

  async function generate(repo: SourceControlRepo) {
    setGenerating((current) => [...current, repo.path])
    try {
      props.onMessage(
        repo.path,
        await call(props.machine, 'git.message', {
          projectId: props.projectId,
          repo: repo.path,
          staged: repo.staged.length > 0,
        })
      )
    } catch (caught) {
      showError(caught)
    } finally {
      setGenerating((current) => current.filter((item) => item !== repo.path))
    }
  }

  function undo(repo: SourceControlRepo) {
    void props.onPerform(async () => {
      props.onMessage(
        repo.path,
        await call(props.machine, 'git.undoCommit', {
          projectId: props.projectId,
          repo: repo.path,
        })
      )
    })
  }

  function unstage(repo: SourceControlRepo, resources: GitResource[]) {
    void run(repo, {
      kind: 'unstage',
      paths: resources.flatMap((resource) =>
        resource.from === null
          ? [resource.path]
          : [resource.path, resource.from]
      ),
    })
  }

  function stage(repo: SourceControlRepo, resources: GitResource[]) {
    void run(repo, {
      kind: 'stage',
      paths: resources.map((resource) => resource.path),
    })
  }

  function moreActions(repo: SourceControlRepo) {
    return (
      <MoreActions
        repo={repo}
        settings={settings}
        onSettings={props.onSettings}
        onCommit={(options) => void commit(repo, options)}
        onUndo={() => undo(repo)}
        onRun={(action) => void run(repo, action)}
        onRemote={(method) => void remote(repo, method)}
        onStage={(resources) => stage(repo, resources)}
        onUnstage={(resources) => unstage(repo, resources)}
        onDiscard={(resources) => setDiscarding({ repo, resources })}
        onCheckout={() => props.onCheckout(repo)}
      />
    )
  }

  const discardFiles = discarding?.resources ?? []
  const untracked = discardFiles.filter((resource) => resource.status === 'U')

  return (
    <div className="bg-sidebar flex h-full min-h-0 flex-col">
      <div className="text-sidebar-foreground border-sidebar-border relative flex h-9 shrink-0 items-center gap-0.5 border-b px-1.5">
        {props.header}
        <Button
          size="icon-micro"
          variant="ghost"
          title={settings.tree ? 'View as List' : 'View as Tree'}
          aria-label={settings.tree ? 'View as List' : 'View as Tree'}
          onClick={() => props.onSettings({ tree: !settings.tree })}
        >
          <HugeiconsIcon
            icon={settings.tree ? ListViewIcon : ListTreeIcon}
            className="size-4"
          />
        </Button>
        {single !== null && (
          <Button
            size="icon-micro"
            variant="ghost"
            title="Commit"
            aria-label="Commit"
            disabled={props.busy}
            onClick={() => void commit(single, commitDefaults)}
          >
            <HugeiconsIcon icon={CheckIcon} className="size-4" />
          </Button>
        )}
        <Button
          size="icon-micro"
          variant="ghost"
          title="Refresh"
          aria-label="Refresh"
          onClick={props.onRefresh}
        >
          <HugeiconsIcon icon={RefreshCwIcon} className="size-4" />
        </Button>
        {single !== null && moreActions(single)}
        {props.busy && (
          <span className="bg-primary absolute inset-x-0 -bottom-px h-0.5 animate-pulse" />
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {props.error !== null && (
          <p className="text-muted-foreground p-4 text-xs">{props.error}</p>
        )}
        {props.error === null && props.repos === null && (
          <p className="text-muted-foreground p-4 text-xs">Loading…</p>
        )}
        {props.error === null && props.repos?.length === 0 && (
          <p className="text-muted-foreground p-4 text-xs">
            The folder currently open doesn&apos;t have a git repository.
          </p>
        )}
        {repos.map((repo) => (
          <div key={repo.path}>
            {single === null && (
              <div className="group/row text-sidebar-foreground flex h-[22px] items-center gap-1.5 pr-1 pl-2 text-[13px]">
                <span className="truncate font-semibold">
                  {repo.path === '' ? props.name : baseName(repo.path)}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {repo.branch ??
                    (repo.head === null ? '' : shortHash(repo.head))}
                </span>
                <span className="ml-auto hidden shrink-0 items-center gap-0.5 group-hover/row:flex">
                  <RowAction
                    title="Commit"
                    icon={CheckIcon}
                    onClick={() => void commit(repo, commitDefaults)}
                  />
                </span>
                {moreActions(repo)}
              </div>
            )}
            <CommitBox
              repo={repo}
              message={message(repo)}
              generating={generating.includes(repo.path)}
              busy={props.busy}
              nested={single === null}
              onMessage={(text) => props.onMessage(repo.path, text)}
              onGenerate={() => void generate(repo)}
              onCommit={(options) => void commit(repo, options)}
              onRemote={(method) => void remote(repo, method)}
            />
            <ResourceGroups
              repo={repo}
              root={props.root}
              tree={settings.tree}
              sort={settings.sort}
              depth={single === null ? 1 : 0}
              active={props.active}
              onOpen={props.onOpen}
              onStage={(resources) => stage(repo, resources)}
              onUnstage={(resources) => unstage(repo, resources)}
              onDiscard={(resources) => setDiscarding({ repo, resources })}
              onIgnore={(resources) =>
                void run(repo, {
                  kind: 'ignore',
                  paths: resources.map((resource) => resource.path),
                })
              }
            />
          </div>
        ))}
      </div>
      {repos.length > 0 && (
        <Graph
          machine={props.machine}
          projectId={props.projectId}
          repos={repos}
          open={settings.graph}
          height={settings.graphHeight}
          active={props.active}
          onToggle={() => props.onSettings({ graph: !settings.graph })}
          onHeight={(height) => props.onSettings({ graphHeight: height })}
          onOpen={props.onOpen}
          onFetch={(repo) =>
            void run(repo, { kind: 'fetch', prune: false, all: true })
          }
        />
      )}
      <AlertDialog
        open={prompt !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPrompt(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              There are no staged changes to commit.
            </AlertDialogTitle>
            <AlertDialogDescription>
              Would you like to stage all your changes and commit them directly?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="outline"
              onClick={() => {
                if (prompt !== null) {
                  props.onSettings({ smartCommit: true })
                  void commit(prompt.repo, { ...prompt.options, all: true })
                }
              }}
            >
              Always
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                if (prompt !== null) {
                  void commit(prompt.repo, { ...prompt.options, all: true })
                }
              }}
            >
              Yes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={discarding !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDiscarding(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {discardFiles.length > 1
                ? `Are you sure you want to discard ALL changes in ${discardFiles.length} files?`
                : untracked.length === 1
                  ? `Are you sure you want to DELETE the following untracked file: '${baseName(discardFiles[0].path)}'?`
                  : `Are you sure you want to discard changes in '${baseName(discardFiles.at(0)?.path ?? '')}'?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {discardFiles.length > 1 &&
                'This is IRREVERSIBLE! Your current working set will be FOREVER LOST if you proceed.'}
              {discardFiles.length === 1 &&
                untracked.length === 1 &&
                'This is IRREVERSIBLE! This file will be FOREVER LOST if you proceed.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (discarding !== null) {
                  void run(discarding.repo, {
                    kind: 'discard',
                    tracked: discardFiles
                      .filter((resource) => resource.status !== 'U')
                      .map((resource) => resource.path),
                    untracked: untracked.map((resource) => resource.path),
                  })
                }
              }}
            >
              {discardFiles.length > 1
                ? `Discard All ${discardFiles.length} Files`
                : untracked.length === 1
                  ? 'Delete File'
                  : 'Discard File'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
