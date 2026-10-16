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
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { call } from '@/connection'
import { errorMessage } from '@/lib/utils'
import { getState, updateConfig, useStore } from '@/store'
import diffCss from '@/git/diff.css?raw'

const toggle =
  'text-foreground hover:bg-accent aria-pressed:bg-accent inline-flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-lg px-1.5 [&_svg]:opacity-80'
const segment =
  'text-muted-foreground hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground dark:aria-pressed:bg-input/72 inline-flex h-6 cursor-pointer items-center justify-center rounded-md px-2.5 aria-pressed:shadow-xs'

export function DiffPanel(props: {
  cwd: string
  running: boolean
  onClose: () => void
}) {
  const [files, setFiles] = useState<FileDiffMetadata[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const diff = useStore((state) => state.config.diff)
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    const stored = localStorage.getItem(`diffCollapsed:${props.cwd}`)
    if (stored === null) return []
    const names: unknown = JSON.parse(stored)
    if (Array.isArray(names) && names.every((name) => typeof name === 'string'))
      return names
    throw new Error(`invalid diffCollapsed:${props.cwd} in localStorage`)
  })

  function collapse(names: string[]) {
    setCollapsed(names)
    localStorage.setItem(`diffCollapsed:${props.cwd}`, JSON.stringify(names))
  }

  useEffect(() => {
    let current = true
    call('git.diff', { cwd: props.cwd }).then(
      (patch) => {
        if (!current) return
        setFiles(
          patch.trim() === ''
            ? []
            : parsePatchFiles(patch, `${props.cwd}:${version}`).flatMap(
                (patch) => patch.files
              )
        )
        setError(null)
      },
      (caught: unknown) => {
        if (current) setError(errorMessage(caught))
      }
    )
    return () => {
      current = false
    }
  }, [props.cwd, props.running, version])

  const list = files ?? []
  const added = list.reduce(
    (total, file) =>
      total + file.hunks.reduce((sum, hunk) => sum + hunk.additionLines, 0),
    0
  )
  const removed = list.reduce(
    (total, file) =>
      total + file.hunks.reduce((sum, hunk) => sum + hunk.deletionLines, 0),
    0
  )
  const allCollapsed =
    list.length > 0 && list.every((file) => collapsed.includes(file.name))

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center justify-between gap-2 border-b pr-39 pl-3">
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
            disabled={props.running}
            onClick={() => setVersion(version + 1)}
          >
            <HugeiconsIcon icon={RefreshCwIcon} className="size-3.5" />
          </Button>
          {list.length > 0 && (
            <Button
              size="icon-sm"
              variant="ghost"
              title={allCollapsed ? 'Expand all files' : 'Collapse all files'}
              onClick={() =>
                collapse(allCollapsed ? [] : list.map((file) => file.name))
              }
            >
              {allCollapsed ? (
                <HugeiconsIcon icon={UnfoldMoreIcon} className="size-3.5" />
              ) : (
                <HugeiconsIcon icon={ChevronsDownUpIcon} className="size-3.5" />
              )}
            </Button>
          )}
          <div className="bg-input/40 flex shrink-0 items-center rounded-lg p-0.5">
            <button
              className={segment}
              aria-pressed={!diff.split}
              aria-label="Stacked diff view"
              onClick={() =>
                updateConfig({
                  ...getState().config,
                  diff: { ...diff, split: false },
                })
              }
            >
              <HugeiconsIcon icon={Rows3Icon} className="size-3.5" />
            </button>
            <button
              className={segment}
              aria-pressed={diff.split}
              aria-label="Split diff view"
              onClick={() =>
                updateConfig({
                  ...getState().config,
                  diff: { ...diff, split: true },
                })
              }
            >
              <HugeiconsIcon icon={LayoutTwoColumnIcon} className="size-3.5" />
            </button>
          </div>
          <button
            className={toggle}
            aria-pressed={diff.wrap}
            title={diff.wrap ? 'Disable line wrapping' : 'Enable line wrapping'}
            onClick={() =>
              updateConfig({
                ...getState().config,
                diff: { ...diff, wrap: !diff.wrap },
              })
            }
          >
            <HugeiconsIcon icon={TextWrapIcon} className="size-3.5" />
          </button>
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
            const closed = collapsed.includes(file.name)
            return (
              <FileDiff
                key={file.name}
                fileDiff={file}
                options={{
                  collapsed: closed,
                  diffStyle: diff.split ? 'split' : 'unified',
                  lineDiffType: 'none',
                  overflow: diff.wrap ? 'wrap' : 'scroll',
                  theme: 'pierre-dark',
                  themeType: 'dark',
                  unsafeCSS: diffCss,
                }}
                renderHeaderPrefix={() => (
                  <button
                    className="text-muted-foreground hover:text-foreground flex size-5 cursor-pointer items-center justify-center"
                    aria-label={closed ? 'Expand file' : 'Collapse file'}
                    onClick={() =>
                      collapse(
                        closed
                          ? collapsed.filter((name) => name !== file.name)
                          : [...collapsed, file.name]
                      )
                    }
                  >
                    {closed ? (
                      <HugeiconsIcon
                        icon={ChevronRightIcon}
                        className="size-3.5"
                      />
                    ) : (
                      <HugeiconsIcon
                        icon={ChevronDownIcon}
                        className="size-3.5"
                      />
                    )}
                  </button>
                )}
              />
            )
          })}
      </div>
    </div>
  )
}
