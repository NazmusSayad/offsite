import { ChevronDownIcon, ChevronRightIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  PullRequestDetails,
  ReviewGuide,
  ReviewGuideCategory,
} from '@offsite/core/pull-requests'
import { FileDiff } from '@pierre/diffs/react'
import { sumBy } from 'es-toolkit'
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { Skeleton } from '@/components/ui/skeleton'
import { DiffOptions, FullscreenButton } from '@/features/git/diff-options'
import { useStore } from '@/lib/store'
import { useCodeTheme } from '@/lib/theme'
import { cn, errorMessage } from '@/lib/utils'
import { loadDiff, useDiff } from './pull-request-cache'
import diffCss from '@/features/git/diff.css?raw'

const HEADER_HEIGHT = 32
const LINE_HEIGHT = 20
const RENDER_MARGIN = '1200px 0px'

const categories: { value: ReviewGuideCategory; label: string }[] = [
  { value: 'core', label: 'Core logic' },
  { value: 'tests', label: 'Tests' },
  { value: 'dependencies', label: 'Dependencies' },
  { value: 'config', label: 'Config and build' },
  { value: 'docs', label: 'Docs' },
  { value: 'other', label: 'Other changes' },
]

export function PullRequestFiles(props: {
  machine: string
  url: string
  head: string
  files: PullRequestDetails['files']
  title: string
  fullscreen: boolean
  onFullscreen: (fullscreen: boolean) => void
  groups: NonNullable<ReviewGuide['groups']> | null
}) {
  const files = useDiff(props.machine, props.url, props.head) ?? null
  const [error, setError] = useState<string | null>(null)
  const flipped = useLocalStorage<string[]>('diffFlipped', [])
  const diff = useStore((state) => state.prefs.diff)
  const codeTheme = useCodeTheme()

  useEffect(() => {
    let current = true
    async function load() {
      try {
        await loadDiff(props.machine, props.url, props.head)
        if (current) {
          setError(null)
        }
      } catch (caught) {
        if (current) {
          setError(errorMessage(caught))
        }
      }
    }
    void load()
    return () => {
      current = false
    }
  }, [props.machine, props.url, props.head])

  if (error !== null) {
    return (
      <p className="text-muted-foreground p-4 text-center text-xs whitespace-pre-wrap">
        {error}
      </p>
    )
  }
  if (files === null && props.files.length === 0) {
    return (
      <div aria-label="Loading files">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="border-border/60 flex h-9 items-center gap-2.5 border-b px-3"
          >
            <Skeleton className="size-3 shrink-0" />
            <Skeleton className="size-4 shrink-0 rounded" />
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="ml-auto h-3 w-10" />
          </div>
        ))}
      </div>
    )
  }
  if (files === null) {
    return (
      <div aria-label="Loading files">
        {props.files.map((file) => (
          <FilePlaceholder
            key={file.path}
            path={file.path}
            additions={file.additions}
            deletions={file.deletions}
            lines={
              diff.collapsed !==
              flipped[0].includes(`${props.url}/${file.path}`)
                ? null
                : 3
            }
          />
        ))}
      </div>
    )
  }
  if (files.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-center text-xs">
        No file changes.
      </p>
    )
  }
  const groups = props.groups
  const sections =
    groups === null
      ? [{ category: null, files }]
      : categories
          .map((category) => ({
            category,
            files: files.filter(
              (file) =>
                (groups.find((group) => group.path === file.name)?.category ??
                  'other') === category.value
            ),
          }))
          .filter((section) => section.files.length > 0)
  return (
    <div
      className={cn(
        props.fullscreen && 'bg-background fixed inset-0 z-50 flex flex-col'
      )}
    >
      {props.fullscreen && (
        <div className="border-border/60 flex h-(--workspace-topbar-height) shrink-0 items-center justify-between gap-2 border-b px-3">
          <span className="text-foreground min-w-0 truncate text-xs font-medium">
            {props.title}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <DiffOptions collapsible />
            <FullscreenButton
              fullscreen={props.fullscreen}
              onFullscreen={props.onFullscreen}
            />
          </div>
        </div>
      )}
      <div
        className={cn(
          'diff-render-surface [--code-background:var(--background)]',
          props.fullscreen && 'min-h-0 flex-1 overflow-y-auto'
        )}
      >
        {sections.map((section) => (
          <Fragment key={section.category?.value ?? 'all'}>
            {section.category !== null && (
              <div className="border-border/60 text-foreground flex h-8 items-center gap-2 border-b px-3 text-xs font-medium">
                <span className="min-w-0 truncate">
                  {section.category.label}
                </span>
                <span className="text-muted-foreground">
                  {section.files.length}
                </span>
                <span className="text-2xs ml-auto inline-flex shrink-0 items-center gap-1 font-mono tabular-nums">
                  <span className="text-diff-addition">
                    +
                    {sumBy(section.files, (file) =>
                      sumBy(file.hunks, (hunk) => hunk.additionLines)
                    )}
                  </span>
                  <span className="text-diff-deletion">
                    -
                    {sumBy(section.files, (file) =>
                      sumBy(file.hunks, (hunk) => hunk.deletionLines)
                    )}
                  </span>
                </span>
              </div>
            )}
            {section.files.map((file) => {
              const key = `${props.url}/${file.name}`
              const closed = diff.collapsed !== flipped[0].includes(key)
              function toggleFile() {
                flipped[1](
                  flipped[0].includes(key)
                    ? flipped[0].filter((name) => name !== key)
                    : [...flipped[0], key]
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
                  <Deferred
                    placeholder={
                      <FilePlaceholder
                        path={file.name}
                        additions={sumBy(
                          file.hunks,
                          (hunk) => hunk.additionLines
                        )}
                        deletions={sumBy(
                          file.hunks,
                          (hunk) => hunk.deletionLines
                        )}
                        lines={
                          closed
                            ? null
                            : diff.split
                              ? file.splitLineCount
                              : file.unifiedLineCount
                        }
                      />
                    }
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
                  </Deferred>
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function Deferred(props: { placeholder: ReactNode; children: ReactNode }) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = ref.current
    if (visible || element === null) {
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
        }
      },
      { root: scrollParent(element), rootMargin: RENDER_MARGIN }
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])

  if (visible) {
    return props.children
  }
  return <div ref={ref}>{props.placeholder}</div>
}

function scrollParent(element: HTMLElement) {
  for (
    let parent = element.parentElement;
    parent !== null;
    parent = parent.parentElement
  ) {
    if (['auto', 'scroll'].includes(getComputedStyle(parent).overflowY)) {
      return parent
    }
  }
  return null
}

function FilePlaceholder(props: {
  path: string
  additions: number
  deletions: number
  lines: number | null
}) {
  return (
    <div
      className="border-border/60 border-b"
      style={{
        height:
          props.lines === null
            ? HEADER_HEIGHT
            : HEADER_HEIGHT + props.lines * LINE_HEIGHT,
      }}
    >
      <div
        className="flex items-center gap-2 px-3"
        style={{ height: HEADER_HEIGHT }}
      >
        <Skeleton className="size-3.5 shrink-0" />
        <span className="text-foreground min-w-0 flex-1 truncate text-xs">
          {props.path}
        </span>
        <span className="text-2xs inline-flex shrink-0 items-center gap-1 font-mono tabular-nums">
          <span className="text-diff-addition">+{props.additions}</span>
          <span className="text-diff-deletion">-{props.deletions}</span>
        </span>
      </div>
      {props.lines !== null && (
        <div className="grid gap-2 px-3 pt-1">
          {Array.from({ length: Math.min(props.lines, 3) }, (_, index) => (
            <Skeleton key={index} className="h-3 w-3/4" />
          ))}
        </div>
      )}
    </div>
  )
}
