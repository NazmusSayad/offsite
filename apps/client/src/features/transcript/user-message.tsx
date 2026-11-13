import {
  CheckIcon,
  CopyIcon,
  RefreshIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Markdown } from '@/components/markdown/markdown'
import { Button } from '@/components/ui/button'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { Tooltip } from '@/components/ui/tooltip'
import { ViewableImage } from '@/components/viewable-image'
import { stageText } from '@/features/composer/worktree-bar'
import { MessageBookmarkButton } from '@/features/transcript/bookmarks'
import { RewindMenu } from '@/features/transcript/rewind-menu'
import type { UserItem } from '@/features/transcript/timeline'
import { Shimmer } from '@/features/transcript/tool-row'
import { useCopy } from '@/lib/clipboard'
import { clock, fullTime } from '@/lib/format'
import { logger } from '@/lib/log'
import { selectedPrompts, outboxId } from '@/lib/outbox'
import { resend, unqueue } from '@/lib/sessions'
import { skillPill, skillRanges } from '@/lib/skills'
import { useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const log = logger.withTag('transcript')

const ImageViewer = lazy(async () => ({
  default: (await import('@/components/image-viewer')).ImageViewer,
}))

const IMAGE_LIMIT = 20
const fade =
  'linear-gradient(to bottom, black calc(100% - 1.75rem), transparent)'

const images = new Map<string, Promise<{ data: string }>>()

export function UserMessage(props: {
  item: UserItem
  first: boolean
  running: boolean
  rewind: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const item = props.item
  const prompt =
    item.format === 'text' || item.format === 'command' ? item.text : ''
  const canCollapse =
    prompt.trim() !== '' &&
    (prompt.length > 600 || prompt.split('\n').length > 8)
  const collapsed = canCollapse && !expanded
  const capabilities = useStore((state) => state.capabilities)
  const found = skillRanges(item.text, capabilities?.commands ?? [])
  const ranges =
    item.format === 'command' && found.length === 0
      ? [{ start: 0, end: item.text.search(/\s|$/) }]
      : found
  const numbers = [
    ...new Set(
      [...item.text.matchAll(/\[Image #(\d+)\]/g)].map((match) =>
        Number(match[1])
      )
    ),
  ].sort((first, second) => first - second)
  const inline =
    item.format === 'text' &&
    item.images.length > 0 &&
    numbers.length === item.images.length
  const outboxPromptId = outboxId(item)
  const failed = useStore(
    (state) =>
      outboxPromptId !== null &&
      selectedPrompts(state).some(
        (other) => other.id === outboxPromptId && other.status === 'failed'
      )
  )
  return (
    <div className="group flex flex-col items-end gap-1">
      <div
        className={cn(
          'bg-message text-message-foreground relative max-w-[80%] rounded-2xl px-3 py-2',
          outboxPromptId !== null && !failed && 'isolate'
        )}
      >
        {outboxPromptId !== null && !failed && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-2xl bg-[color-mix(in_srgb,var(--text)_12%,var(--message))]"
          >
            <div className="message-sweep" />
            <div className="bg-message absolute inset-px rounded-[calc(1rem-1px)]" />
          </div>
        )}
        {item.images.length > 0 && !inline && (
          <div className="mb-2 grid max-w-[210px] grid-cols-2 gap-2">
            {item.images.map((image, index) => (
              <div
                key={index}
                className="border-border/80 bg-background/70 aspect-[4/3] overflow-hidden rounded-lg border"
              >
                <PromptImage
                  itemId={item.id}
                  index={index}
                  mediaType={image.mediaType}
                  data={image.data}
                />
              </div>
            ))}
          </div>
        )}
        {item.text !== '' && (
          <div>
            <div
              data-message-text
              className={cn(
                'relative',
                collapsed && 'max-h-44 overflow-hidden'
              )}
              style={
                collapsed
                  ? { WebkitMaskImage: fade, maskImage: fade }
                  : undefined
              }
            >
              {item.format === 'command' && !item.text.startsWith('/') && (
                <span className="font-mono text-sm">{item.text}</span>
              )}
              {item.format === 'command' && item.text.startsWith('/') && (
                <p className="text-foreground text-sm leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {ranges.map((range, index) => [
                    item.text.slice(ranges[index - 1]?.end ?? 0, range.start),
                    <span key={range.start} className={skillPill}>
                      {item.text.slice(range.start, range.end)}
                    </span>,
                  ])}
                  {item.text.slice(ranges.at(-1)?.end ?? 0)}
                </p>
              )}
              {item.format === 'output' && (
                <pre className="text-muted-foreground font-mono text-xs whitespace-pre-wrap">
                  {item.text}
                </pre>
              )}
              {item.format === 'text' && (
                <Markdown
                  text={item.text}
                  className="text-foreground"
                  lineBreaks
                  rawHtml={false}
                  skills={ranges.map((range) =>
                    item.text.slice(range.start + 1, range.end)
                  )}
                  images={inline}
                  components={{
                    span: (span) => {
                      const index = numbers.indexOf(
                        Number(span.node?.properties.dataImage)
                      )
                      if (!inline || index === -1) {
                        return (
                          <span className={span.className}>
                            {span.children}
                          </span>
                        )
                      }
                      return (
                        <ImageChip
                          itemId={item.id}
                          index={index}
                          number={numbers[index]}
                          mediaType={item.images[index].mediaType}
                          data={item.images[index].data}
                        />
                      )
                    },
                  }}
                />
              )}
            </div>
            {canCollapse && (
              <div className="mt-1.5 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost-muted"
                  aria-expanded={expanded}
                  className="-ml-1"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? 'Show less' : 'Show full message'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
      <div
        className={cn(
          'flex h-6 w-full max-w-[80%] items-center justify-end pe-1 text-xs tabular-nums opacity-0 select-none transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100 pointer-coarse:opacity-100',
          outboxPromptId !== null && 'opacity-100'
        )}
      >
        <div className="flex shrink-0 items-center gap-2">
          {outboxPromptId !== null && !failed && <WorktreeStageLabel />}
          {outboxPromptId !== null && failed && (
            <div className="flex items-center gap-0.5">
              <p className="text-error me-1 text-xs">Not sent</p>
              <Button
                variant="ghost-muted"
                size="icon-micro"
                title="Resend"
                onClick={() => resend(outboxPromptId)}
              >
                <HugeiconsIcon icon={RefreshIcon} className="size-3.5" />
              </Button>
              <Button
                variant="ghost-muted"
                size="icon-micro"
                title="Remove"
                onClick={() => unqueue(outboxPromptId)}
              >
                <HugeiconsIcon icon={XIcon} className="size-3.5" />
              </Button>
            </div>
          )}
          {item.time !== null && (
            <Tooltip label={fullTime(item.time)}>
              <p className="text-muted-foreground text-xs tabular-nums">
                {clock(item.time)}
              </p>
            </Tooltip>
          )}
          {prompt !== '' && (outboxPromptId === null || !failed) && (
            <div
              className={cn(
                'flex items-center gap-0.5',
                outboxPromptId !== null && 'hidden pointer-coarse:flex'
              )}
            >
              {props.rewind && (
                <RewindMenu
                  target={{
                    messageId: item.id,
                    text: prompt,
                    images: item.images,
                    first: props.first,
                  }}
                  disabled={props.running || outboxPromptId !== null}
                />
              )}
              <MessageBookmarkButton
                itemId={item.id}
                disabled={outboxPromptId !== null}
              />
              <MessageCopyButton text={prompt} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WorktreeStageLabel() {
  const stage = useStore((state) =>
    state.selection?.sessionId === null ? state.worktreeStage : null
  )
  if (stage === null) {
    return null
  }
  return (
    <p className="text-muted-foreground text-xs">
      <Shimmer text={stageText(stage)} active />
    </p>
  )
}

export function MessageCopyButton(props: { text: string }) {
  const clipboard = useCopy()
  return (
    <Tooltip label="Copy message">
      <Button
        type="button"
        size="icon-micro"
        variant="ghost-muted"
        aria-label="Copy message"
        disabled={clipboard.copied}
        onClick={() => void clipboard.copy(props.text)}
      >
        <HugeiconsIcon
          icon={clipboard.copied ? CheckIcon : CopyIcon}
          className={cn('size-4', clipboard.copied && 'text-primary')}
        />
      </Button>
    </Tooltip>
  )
}

function ImageChip(props: {
  itemId: string
  index: number
  number: number
  mediaType: string
  data: string | null
}) {
  const data = usePromptImage(props.itemId, props.index, props.data)
  const [open, setOpen] = useState(false)
  const name = `Image #${props.number}`
  return (
    <>
      <HoverCard openDelay={150} closeDelay={50}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="bg-background/60 border-border/70 mx-0.5 inline-flex h-6 cursor-zoom-in items-center gap-1 rounded-md border p-0.5 pe-1.5 align-middle text-xs"
            onClick={() => setOpen(true)}
          >
            {data === null ? (
              <span className="bg-muted size-4.5 shrink-0 rounded-sm" />
            ) : (
              <img
                src={`data:${props.mediaType};base64,${data}`}
                alt=""
                className="size-4.5 shrink-0 rounded-sm object-cover"
              />
            )}
            {name}
          </button>
        </HoverCardTrigger>
        {data !== null && (
          <HoverCardContent className="p-1">
            <button
              type="button"
              className="block cursor-zoom-in"
              onClick={() => setOpen(true)}
            >
              <img
                src={`data:${props.mediaType};base64,${data}`}
                alt={name}
                className="block max-h-80 max-w-80 rounded-md object-contain"
              />
            </button>
          </HoverCardContent>
        )}
      </HoverCard>
      {open && data !== null && (
        <Suspense>
          <ImageViewer
            src={`data:${props.mediaType};base64,${data}`}
            alt=""
            name={name}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}

function PromptImage(props: {
  itemId: string
  index: number
  mediaType: string
  data: string | null
}) {
  const data = usePromptImage(props.itemId, props.index, props.data)
  if (data === null) {
    return null
  }
  return (
    <ViewableImage
      src={`data:${props.mediaType};base64,${data}`}
      alt=""
      name="Image"
      className="block size-full"
      imageClassName="block size-full object-cover"
    />
  )
}

function usePromptImage(itemId: string, index: number, data: string | null) {
  const selection = useStore((state) => state.selection)
  const machine = selection?.machine ?? null
  const sessionId = selection?.sessionId ?? null
  const [loaded, setLoaded] = useState<string | null>(null)

  useEffect(() => {
    if (data !== null || machine === null || sessionId === null) {
      return
    }
    let current = true
    const key = JSON.stringify([machine, sessionId, itemId, index])
    let request = images.get(key)
    if (request === undefined) {
      request = call(machine, 'sessions.image', {
        sessionId,
        itemId,
        index,
      })
      images.set(key, request)
      if (images.size > IMAGE_LIMIT) {
        const [oldest] = images.keys()
        images.delete(oldest)
      }
      request.catch(() => images.delete(key))
    }
    request
      .then((result) => {
        if (current) {
          setLoaded(result.data)
        }
      })
      .catch((error: unknown) => log.error('could not load an image', error))
    return () => {
      current = false
    }
  }, [data, itemId, index, machine, sessionId])

  return data ?? loaded
}
