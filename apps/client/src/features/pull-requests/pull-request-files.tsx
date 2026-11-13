import { ChevronDownIcon, ChevronRightIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type FileDiffMetadata, parsePatchFiles } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { useStore } from '@/lib/store'
import { useCodeTheme } from '@/lib/theme'
import { errorMessage } from '@/lib/utils'
import diffCss from '@/features/git/diff.css?raw'

export function PullRequestFiles(props: {
  machine: string
  projectId: string
  repo: string
  url: string
  head: string
}) {
  const [files, setFiles] = useState<FileDiffMetadata[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flipped, setFlipped] = useState<string[]>([])
  const diff = useStore((state) => state.prefs.diff)
  const codeTheme = useCodeTheme()

  useEffect(() => {
    let current = true
    call(props.machine, 'pulls.diff', {
      projectId: props.projectId,
      repo: props.repo,
      url: props.url,
      head: props.head,
    }).then(
      (patch) => {
        if (current) {
          setError(null)
          setFiles(
            patch.trim() === ''
              ? []
              : parsePatchFiles(
                  patch,
                  `pull ${props.repo} ${props.url} ${props.head}`
                ).flatMap((item) => item.files)
          )
        }
      },
      (caught: unknown) => {
        if (current) {
          setError(errorMessage(caught))
        }
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, props.projectId, props.repo, props.url, props.head])

  if (error !== null) {
    return (
      <p className="text-muted-foreground p-4 text-center text-xs whitespace-pre-wrap">
        {error}
      </p>
    )
  }
  if (files === null) {
    return (
      <p className="text-muted-foreground p-4 text-center text-xs">Loading…</p>
    )
  }
  if (files.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-center text-xs">
        No file changes.
      </p>
    )
  }
  return (
    <div className="diff-render-surface [--code-background:var(--background)]">
      {files.map((file) => {
        const closed = diff.collapsed !== flipped.includes(file.name)
        function toggleFile() {
          setFlipped(
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
  )
}
