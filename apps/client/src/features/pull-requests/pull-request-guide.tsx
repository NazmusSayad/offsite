import { Route01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  ReviewGuideState,
  ReviewGuideStop,
} from '@offsite/core/pull-requests'
import { parsePatchFiles } from '@pierre/diffs'
import { FileDiff } from '@pierre/diffs/react'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { timeAgo } from '@/lib/format'
import { useStore } from '@/lib/store'
import { useCodeTheme } from '@/lib/theme'
import { errorMessage } from '@/lib/utils'
import { PullRequestFiles } from './pull-request-files'
import diffCss from '@/features/git/diff.css?raw'

const attentionLabels: Record<
  NonNullable<ReviewGuideStop['attention']>['kind'],
  string
> = {
  tradeoff: 'Tradeoff',
  contract: 'Contract',
  product: 'Product call',
  risk: 'Risk',
  accessibility: 'Accessibility',
}

export function PullRequestGuide(props: {
  machine: string
  projectId: string
  url: string
  head: string
  view: 'guidebook' | 'changes'
  title: string
  fullscreen: boolean
  onFullscreen: (fullscreen: boolean) => void
}) {
  const [state, setState] = useState<ReviewGuideState | null>(null)
  const [writing, setWriting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)

  async function write() {
    setWriting(true)
    setError(null)
    setChosen(null)
    try {
      setState(
        await call(props.machine, 'pulls.writeGuide', {
          projectId: props.projectId,
          url: props.url,
        })
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setWriting(false)
    }
  }

  useEffect(() => {
    let current = true
    async function load() {
      try {
        const result = await call(props.machine, 'pulls.guide', {
          url: props.url,
        })
        if (!current) {
          return
        }
        setState(result)
        if (!result.running) {
          return
        }
        setWriting(true)
        const written = await call(props.machine, 'pulls.writeGuide', {
          projectId: props.projectId,
          url: props.url,
        })
        if (current) {
          setState(written)
        }
      } catch (caught) {
        if (current) {
          setError(errorMessage(caught))
        }
      } finally {
        if (current) {
          setWriting(false)
        }
      }
    }
    void load()
    return () => {
      current = false
    }
  }, [props.machine, props.projectId, props.url])

  const guides = state?.guides ?? []
  const guide =
    chosen === null
      ? (guides[0] ?? null)
      : (guides.find((item) => item.head === chosen) ?? null)

  return (
    <>
      <div className="grid gap-4 p-4">
        {error !== null && (
          <p className="text-destructive bg-destructive/8 rounded-lg px-3 py-2 text-xs wrap-anywhere whitespace-pre-wrap">
            {error}
          </p>
        )}
        {state === null && error === null && (
          <div aria-label="Loading guidebook" className="grid gap-4">
            <Skeleton className="h-3.5 w-48" />
            {Array.from({ length: 2 }, (_, index) => (
              <div
                key={index}
                className="border-border/60 grid gap-3 rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <Skeleton className="size-5 shrink-0 rounded-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-5/6" />
                <Skeleton className="h-24 w-full" />
              </div>
            ))}
          </div>
        )}
        {writing && (
          <p className="text-muted-foreground text-shimmer text-center text-sm">
            Writing the guidebook. This can take a minute…
          </p>
        )}
        {state !== null && guide === null && !writing && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <HugeiconsIcon
              icon={Route01Icon}
              className="text-muted-foreground/50 size-8"
            />
            <div className="grid max-w-80 gap-1">
              <p className="text-foreground text-sm font-medium">
                Review this pull request as a guided tour
              </p>
              <p className="text-muted-foreground text-xs">
                The small model reads the description and the diff, and puts the
                changes in a few stops in reading order. It marks only the
                points where you must make a decision, and groups the changed
                files by kind.
              </p>
            </div>
            <Button size="sm" onClick={() => void write()}>
              Write guidebook
            </Button>
          </div>
        )}
        {state !== null && guide !== null && !writing && (
          <>
            {guide.head !== props.head && (
              <div className="border-warning/40 bg-warning/8 flex items-center gap-3 rounded-lg border px-3 py-2">
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-warning text-xs font-medium">
                    Outdated
                  </span>
                  <span className="text-foreground/90 text-xs">
                    This guidebook is for commit {guide.head.slice(0, 7)}. The
                    pull request has new commits since then.
                  </span>
                </div>
                {!guides.some((item) => item.head === props.head) && (
                  <Button size="xs" onClick={() => void write()}>
                    Write for the latest commit
                  </Button>
                )}
              </div>
            )}
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              {guides.length === 1 && (
                <span className="min-w-0 flex-1">
                  Commit {guide.head.slice(0, 7)} · written{' '}
                  {ago(guide.createdAt)}
                </span>
              )}
              {guides.length > 1 && (
                <div className="min-w-0 flex-1">
                  <Select value={guide.head} onValueChange={setChosen}>
                    <SelectTrigger size="sm" className="max-w-72">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {guides.map((item) => (
                        <SelectItem key={item.head} value={item.head}>
                          Commit {item.head.slice(0, 7)} · {ago(item.createdAt)}
                          {item.head === props.head && ' · latest'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {guide.head === props.head && (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => void write()}
                >
                  Write again
                </Button>
              )}
            </div>
            {props.view === 'guidebook' &&
              guide.stops.map((stop, index) => (
                <GuideStop key={index} stop={stop} index={index} />
              ))}
            {props.view === 'changes' && guide.groups === undefined && (
              <p className="text-muted-foreground text-center text-xs">
                This guidebook was written before files were grouped. Write it
                again to group the files.
              </p>
            )}
          </>
        )}
      </div>
      {props.view === 'changes' &&
        state !== null &&
        guide?.groups !== undefined &&
        !writing && (
          <PullRequestFiles
            machine={props.machine}
            url={props.url}
            head={props.head}
            title={props.title}
            fullscreen={props.fullscreen}
            onFullscreen={props.onFullscreen}
            groups={guide.groups}
          />
        )}
    </>
  )
}

function ago(time: number) {
  const value = timeAgo(time)
  return value === 'now' ? 'just now' : `${value} ago`
}

function GuideStop(props: { stop: ReviewGuideStop; index: number }) {
  const stop = props.stop
  const codeTheme = useCodeTheme()
  const diff = useStore((state) => state.prefs.diff)

  return (
    <section className="border-border/60 grid gap-3 rounded-lg border p-3">
      <h3 className="text-foreground flex items-start gap-2 text-sm font-semibold">
        <span className="bg-primary/12 text-primary grid size-5 shrink-0 place-items-center rounded-full text-xs tabular-nums">
          {props.index + 1}
        </span>
        {stop.title}
      </h3>
      <p className="text-foreground/90 text-sm leading-relaxed">
        {stop.summary}
      </p>
      {stop.attention !== null && (
        <div className="border-warning/40 bg-warning/8 grid gap-0.5 rounded-md border-l-2 px-3 py-2 text-sm">
          <span className="text-warning text-xs font-medium">
            {attentionLabels[stop.attention.kind]}
          </span>
          <span className="text-foreground/90">{stop.attention.note}</span>
        </div>
      )}
      {stop.excerpts.map((excerpt, index) => (
        <div
          key={`${excerpt.path} ${index}`}
          className="grid gap-1 overflow-hidden"
        >
          {excerpt.caption !== '' && (
            <span className="text-muted-foreground text-xs">
              {excerpt.caption}
            </span>
          )}
          <div className="diff-render-surface border-border/60 overflow-hidden rounded-md border [--code-background:var(--background)]">
            {parsePatchFiles(excerpt.patch, {
              cacheKeyPrefix: `guide ${excerpt.patch}`,
            })
              .flatMap((patch) => patch.files)
              .map((file) => (
                <FileDiff
                  key={file.name}
                  fileDiff={file}
                  options={{
                    theme: codeTheme,
                    themeType: 'dark',
                    unsafeCSS: diffCss,
                    lineDiffType: 'word-alt',
                    overflow: diff.wrap ? 'wrap' : 'scroll',
                    diffStyle: 'unified',
                    hunkSeparators: 'simple',
                  }}
                />
              ))}
          </div>
        </div>
      ))}
      {stop.notes.length > 0 && (
        <ul className="grid gap-1.5">
          {stop.notes.map((note) => (
            <li
              key={`${note.path} ${note.line} ${note.title}`}
              className="text-sm"
            >
              <span className="text-muted-foreground font-mono text-xs">
                {note.path.split('/').at(-1)}:{note.line}
              </span>{' '}
              <span className="text-foreground font-medium">{note.title}</span>
              <span className="text-foreground/80"> — {note.body}</span>
            </li>
          ))}
        </ul>
      )}
      {stop.files.length > 0 && (
        <ul className="grid gap-1">
          {stop.files.map((file) => (
            <li key={file.path} className="flex min-w-0 gap-2 text-xs">
              <span className="text-foreground min-w-0 font-mono wrap-anywhere">
                {file.path}
              </span>
              {file.note !== '' && (
                <span className="text-muted-foreground min-w-0">
                  {file.note}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {stop.questions.length > 0 && (
        <ul className="grid gap-1">
          {stop.questions.map((question) => (
            <li key={question} className="text-muted-foreground text-sm italic">
              {question}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
