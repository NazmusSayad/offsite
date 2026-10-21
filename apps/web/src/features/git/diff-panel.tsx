import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  Coffee02Icon,
  LayoutTwoColumnIcon,
  RefreshCwIcon,
  Rows3Icon,
  TextWrapIcon,
  UnfoldMoreIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type FileDiffMetadata, parsePatchFiles } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { sumBy } from 'es-toolkit'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { getState, updatePrefs, useStore } from '@/lib/store'
import { useCodeTheme } from '@/lib/theme'
import { errorMessage } from '@/lib/utils'
import diffCss from '@/features/git/diff.css?raw'

const DIFF_REFRESH = 3000

const toggle =
  'text-foreground hover:bg-accent aria-pressed:bg-accent inline-flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-lg px-1.5 [&_svg]:opacity-80'
const segment =
  'text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground dark:aria-pressed:bg-input/72 inline-flex h-6 cursor-pointer items-center justify-center rounded-md px-2.5 aria-pressed:shadow-xs'

export function DiffPanel(props: {
  machine: string
  projectId: string
  running: boolean
  toggles: ReactNode
  onClose: () => void
}) {
  const [files, setFiles] = useState<FileDiffMetadata[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const latest = useRef<{ patch: string | null; count: number }>({
    patch: null,
    count: 0,
  })
  const diff = useStore((state) => state.prefs.diff)
  const codeTheme = useCodeTheme()
  const [flipped, flip] = useLocalStorage<string[]>('diffFlipped', [])

  function changeDiff(change: Partial<typeof diff>) {
    updatePrefs({ ...getState().prefs, diff: { ...diff, ...change } })
  }

  useEffect(() => {
    let current = true
    let loading = false
    async function load() {
      if (loading) {
        return
      }
      loading = true
      try {
        const patch = await call(props.machine, 'git.diff', {
          projectId: props.projectId,
        })
        if (!current) {
          return
        }
        setError(null)
        if (patch === latest.current.patch) {
          return
        }
        latest.current = { patch, count: latest.current.count + 1 }
        setFiles(
          patch.trim() === ''
            ? []
            : parsePatchFiles(
                patch,
                `${props.projectId}:${latest.current.count}`
              ).flatMap((patch) => patch.files)
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

  const list = files ?? []
  const added = sumBy(list, (file) =>
    sumBy(file.hunks, (hunk) => hunk.additionLines)
  )
  const removed = sumBy(list, (file) =>
    sumBy(file.hunks, (hunk) => hunk.deletionLines)
  )
  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center justify-between gap-2 border-b pr-3 pl-3">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            title="Close"
            aria-label="Close"
            onClick={props.onClose}
          >
            <HugeiconsIcon icon={XIcon} className="size-3.5" />
          </Button>
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
            <HugeiconsIcon icon={RefreshCwIcon} className="size-3.5" />
          </Button>
          {list.length > 0 && (
            <Button
              size="icon-sm"
              variant="ghost"
              title={diff.collapsed ? 'Expand all files' : 'Collapse all files'}
              onClick={() => {
                flip([])
                changeDiff({ collapsed: !diff.collapsed })
              }}
            >
              <HugeiconsIcon
                icon={diff.collapsed ? UnfoldMoreIcon : ChevronsDownUpIcon}
                className="size-3.5"
              />
            </Button>
          )}
          <div className="bg-input/40 flex shrink-0 items-center rounded-lg p-0.5">
            <button
              className={segment}
              aria-pressed={!diff.split}
              aria-label="Stacked diff view"
              onClick={() => changeDiff({ split: false })}
            >
              <HugeiconsIcon icon={Rows3Icon} className="size-3.5" />
            </button>
            <button
              className={segment}
              aria-pressed={diff.split}
              aria-label="Split diff view"
              onClick={() => changeDiff({ split: true })}
            >
              <HugeiconsIcon icon={LayoutTwoColumnIcon} className="size-3.5" />
            </button>
          </div>
          <button
            className={toggle}
            aria-pressed={diff.wrap}
            title={diff.wrap ? 'Disable line wrapping' : 'Enable line wrapping'}
            onClick={() => changeDiff({ wrap: !diff.wrap })}
          >
            <HugeiconsIcon icon={TextWrapIcon} className="size-3.5" />
          </button>
          {props.toggles}
        </div>
      </div>
      <div className="diff-render-surface min-h-0 flex-1 overflow-y-auto [--code-background:var(--background)]">
        {error !== null && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            {error}
          </p>
        )}
        {error === null && files === null && (
          <p className="text-muted-foreground p-4 text-center text-xs">
            Loading…
          </p>
        )}
        {error === null && files?.length === 0 && (
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
          list.map((file) => {
            const closed = diff.collapsed !== flipped.includes(file.name)
            function toggleFile() {
              flip(
                flipped.includes(file.name)
                  ? flipped.filter((name) => name !== file.name)
                  : [...flipped, file.name]
              )
            }
            return (
              <div
                key={file.name}
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
      </div>
    </div>
  )
}
