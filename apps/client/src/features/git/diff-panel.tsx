import {
  ChevronDownIcon,
  ChevronRightIcon,
  Coffee02Icon,
  RepositoryIcon,
  RefreshCwIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type FileDiffMetadata, parsePatchFiles } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { sumBy } from 'es-toolkit'
import { Fragment, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { DiffOptions, FullscreenButton } from '@/features/git/diff-options'
import { PanelCloseButton } from '@/features/workspace/panel-close-button'
import { useStore } from '@/lib/store'
import { useCodeTheme } from '@/lib/theme'
import { cn, errorMessage } from '@/lib/utils'
import diffCss from '@/features/git/diff.css?raw'

const DIFF_REFRESH = 3000

export function DiffPanel(props: {
  machine: string
  projectId: string
  running: boolean
  onClose: () => void
  mobile: boolean
}) {
  const [groups, setGroups] = useState<
    { repo: string; files: FileDiffMetadata[] }[] | null
  >(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const latest = useRef<{ patch: string | null; count: number }>({
    patch: null,
    count: 0,
  })
  const diff = useStore((state) => state.prefs.diff)
  const codeTheme = useCodeTheme()
  const [flipped, flip] = useLocalStorage<string[]>('diffFlipped', [])
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    let current = true
    let loading = false
    async function load() {
      if (loading) {
        return
      }
      loading = true
      try {
        const diffs = await call(props.machine, 'git.diff', {
          projectId: props.projectId,
        })
        if (!current) {
          return
        }
        setError(null)
        const patch = JSON.stringify(diffs)
        if (patch === latest.current.patch) {
          return
        }
        latest.current = { patch, count: latest.current.count + 1 }
        setGroups(
          diffs
            .map((item) => ({
              repo: item.repo,
              files:
                item.patch.trim() === ''
                  ? []
                  : parsePatchFiles(
                      item.patch,
                      `${props.projectId}:${latest.current.count}:${item.repo}`
                    ).flatMap((patch) => patch.files),
            }))
            .filter((group) => group.files.length > 0)
        )
      } catch (caught) {
        if (current) {
          setError(errorMessage(caught))
        }
      } finally {
        loading = false
      }
    }
    function refresh() {
      if (!document.hidden) {
        void load()
      }
    }
    void load()
    const timer = window.setInterval(refresh, DIFF_REFRESH)
    window.addEventListener('focus', refresh)
    return () => {
      current = false
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [props.machine, props.projectId, props.running, version])

  const list = (groups ?? []).flatMap((group) => group.files)
  const added = sumBy(list, (file) =>
    sumBy(file.hunks, (hunk) => hunk.additionLines)
  )
  const removed = sumBy(list, (file) =>
    sumBy(file.hunks, (hunk) => hunk.deletionLines)
  )
  return (
    <div
      className={cn(
        'bg-background flex h-full min-h-0 min-w-0 flex-col',
        fullscreen && 'fixed inset-0 z-50'
      )}
    >
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center justify-between gap-2 border-b pr-3 pl-3">
        <div className="flex min-w-0 items-center gap-1">
          <PanelCloseButton mobile={props.mobile} onClick={props.onClose} />
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            Uncommitted changes
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {list.length > 0 && (
            <span className="text-2xs mr-1 inline-flex items-center gap-1 font-mono tabular-nums">
              <span className="text-diff-addition">+{added}</span>
              <span className="text-diff-deletion">-{removed}</span>
            </span>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            title="Refresh diff"
            aria-label="Refresh diff"
            onClick={() => setVersion(version + 1)}
          >
            <HugeiconsIcon icon={RefreshCwIcon} className="size-4" />
          </Button>
          <DiffOptions collapsible={list.length > 0} />
          {!props.mobile && (
            <FullscreenButton
              fullscreen={fullscreen}
              onFullscreen={setFullscreen}
            />
          )}
        </div>
      </div>
      <div className="diff-render-surface min-h-0 flex-1 overflow-y-auto [--code-background:var(--background)]">
        {error !== null && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            {error}
          </p>
        )}
        {error === null && groups === null && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            Loading…
          </p>
        )}
        {error === null && groups?.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <HugeiconsIcon
              icon={Coffee02Icon}
              className="text-muted-foreground/40 size-8"
            />
            <div className="grid gap-1">
              <p className="text-muted-foreground text-sm">
                No uncommitted changes
              </p>
              <p className="text-muted-foreground/50 text-xs italic">
                If it works, don&rsquo;t touch it.
              </p>
            </div>
          </div>
        )}
        {error === null &&
          groups?.map((group) => (
            <Fragment key={group.repo}>
              {group.repo !== '' && (
                <div className="border-border/60 text-foreground flex h-8 items-center gap-2 border-b px-3 text-xs font-medium">
                  <HugeiconsIcon
                    icon={RepositoryIcon}
                    className="text-muted-foreground size-3.5 shrink-0"
                  />
                  <span className="min-w-0 truncate">{group.repo}</span>
                  <span className="text-2xs ml-auto inline-flex shrink-0 items-center gap-1 font-mono tabular-nums">
                    <span className="text-diff-addition">
                      +
                      {sumBy(group.files, (file) =>
                        sumBy(file.hunks, (hunk) => hunk.additionLines)
                      )}
                    </span>
                    <span className="text-diff-deletion">
                      -
                      {sumBy(group.files, (file) =>
                        sumBy(file.hunks, (hunk) => hunk.deletionLines)
                      )}
                    </span>
                  </span>
                </div>
              )}
              {group.files.map((file) => {
                const key =
                  group.repo === '' ? file.name : `${group.repo}/${file.name}`
                const closed = diff.collapsed !== flipped.includes(key)
                function toggleFile() {
                  flip(
                    flipped.includes(key)
                      ? flipped.filter((name) => name !== key)
                      : [...flipped, key]
                  )
                }
                return (
                  <div
                    key={key}
                    onClick={(event) => {
                      const title = event.nativeEvent
                        .composedPath()
                        .some(
                          (target) =>
                            target instanceof Element &&
                            target.hasAttribute('data-title')
                        )
                      if (title) {
                        toggleFile()
                      }
                    }}
                  >
                    <FileDiff
                      fileDiff={file}
                      options={{
                        theme: codeTheme,
                        themeType: 'dark',
                        unsafeCSS: diffCss,
                        collapsed: closed,
                        lineDiffType: 'word-alt',
                        overflow: diff.wrap ? 'wrap' : 'scroll',
                        diffStyle: diff.split ? 'split' : 'unified',
                      }}
                      renderHeaderPrefix={() => (
                        <button
                          className="text-muted-foreground hover:text-foreground flex size-5 cursor-pointer items-center justify-center"
                          aria-label={closed ? 'Expand file' : 'Collapse file'}
                          onClick={toggleFile}
                        >
                          <HugeiconsIcon
                            icon={closed ? ChevronRightIcon : ChevronDownIcon}
                            className="size-3.5"
                          />
                        </button>
                      )}
                    />
                  </div>
                )
              })}
            </Fragment>
          ))}
      </div>
    </div>
  )
}
