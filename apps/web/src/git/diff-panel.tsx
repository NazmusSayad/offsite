import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  FileDiffIcon,
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
  const [split, setSplit] = useState(false)
  const [wrap, setWrap] = useState(true)
  const [collapsed, setCollapsed] = useState<string[]>([])

  useEffect(() => {
    if (props.running) return
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
      <div className="flex h-(--workspace-topbar-height) shrink-0 items-center gap-1 pr-28 pl-2">
        <button
          className="group bg-accent text-foreground flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium"
          title="Close"
          onClick={props.onClose}
        >
          <HugeiconsIcon
            icon={FileDiffIcon}
            className="size-3 group-hover:hidden"
          />
          <HugeiconsIcon
            icon={XIcon}
            className="hidden size-3 group-hover:block"
          />
          Diff
        </button>
      </div>
      <div className="border-border/60 bg-background flex h-10 min-h-10 shrink-0 items-center justify-between gap-2 border-b px-2">
        <Button variant="secondary" size="xs" className="min-w-0">
          <span className="truncate">Uncommitted changes</span>
        </Button>
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
                setCollapsed(allCollapsed ? [] : list.map((file) => file.name))
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
              aria-pressed={!split}
              aria-label="Stacked diff view"
              onClick={() => setSplit(false)}
            >
              <HugeiconsIcon icon={Rows3Icon} className="size-3.5" />
            </button>
            <button
              className={segment}
              aria-pressed={split}
              aria-label="Split diff view"
              onClick={() => setSplit(true)}
            >
              <HugeiconsIcon icon={LayoutTwoColumnIcon} className="size-3.5" />
            </button>
          </div>
          <button
            className={toggle}
            aria-pressed={wrap}
            title={wrap ? 'Disable line wrapping' : 'Enable line wrapping'}
            onClick={() => setWrap(!wrap)}
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
          <p className="text-muted-foreground p-6 text-center text-xs">
            No uncommitted changes.
          </p>
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
                  diffStyle: split ? 'split' : 'unified',
                  lineDiffType: 'none',
                  overflow: wrap ? 'wrap' : 'scroll',
                  theme: 'pierre-dark',
                  themeType: 'dark',
                  unsafeCSS: diffCss,
                }}
                renderHeaderPrefix={() => (
                  <button
                    className="text-muted-foreground hover:text-foreground flex size-5 cursor-pointer items-center justify-center"
                    aria-label={closed ? 'Expand file' : 'Collapse file'}
                    onClick={() =>
                      setCollapsed(
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
