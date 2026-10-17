import {
  CheckIcon,
  CopyIcon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Markdown } from '@/components/markdown/markdown'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import type { RewindTarget } from '@/features/transcript/rewind-dialog'
import type { UserItem } from '@/features/transcript/timeline'
import { useCopy } from '@/lib/clipboard'
import { clock, fullTime } from '@/lib/format'
import { showError, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

const fade =
  'linear-gradient(to bottom, black calc(100% - 1.75rem), transparent)'

export function UserMessage(props: {
  item: UserItem
  first: boolean
  running: boolean
  onRewind: ((target: RewindTarget) => void) | null
}) {
  const [expanded, setExpanded] = useState(false)
  const onRewind = props.onRewind
  const item = props.item
  const prompt =
    item.format === 'text' || item.format === 'command' ? item.text : ''
  const canCollapse =
    prompt.trim() !== '' &&
    (prompt.length > 600 || prompt.split('\n').length > 8)
  const collapsed = canCollapse && !expanded
  return (
    <div className="group flex flex-col items-end gap-1">
      <div className="bg-message text-message-foreground relative max-w-[80%] rounded-2xl px-3 py-2">
        {item.images.length > 0 && (
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
              {item.format === 'command' && (
                <span className="font-mono text-sm">{item.text}</span>
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
      <div className="flex w-full max-w-[80%] items-center justify-end pe-1 text-xs tabular-nums opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
        <div className="flex shrink-0 items-center gap-2">
          {item.time !== null && (
            <Tooltip label={fullTime(item.time)}>
              <p className="text-muted-foreground text-xs tabular-nums">
                {clock(item.time)}
              </p>
            </Tooltip>
          )}
          {prompt !== '' && (
            <div className="flex items-center gap-0.5">
              {onRewind !== null && (
                <Tooltip label="Edit from here">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label="Edit from here"
                    disabled={props.running}
                    onClick={() =>
                      onRewind({
                        messageId: item.id,
                        text: prompt,
                        first: props.first,
                      })
                    }
                  >
                    <HugeiconsIcon
                      icon={PencilEdit02Icon}
                      className="size-3.5"
                    />
                  </Button>
                </Tooltip>
              )}
              <MessageCopyButton text={prompt} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function MessageCopyButton(props: { text: string }) {
  const clipboard = useCopy()
  return (
    <Tooltip label="Copy message">
      <Button
        type="button"
        size="icon-xs"
        variant="ghost-muted"
        aria-label="Copy message"
        disabled={clipboard.copied}
        onClick={() => void clipboard.copy(props.text)}
      >
        <HugeiconsIcon
          icon={clipboard.copied ? CheckIcon : CopyIcon}
          className={cn('size-3.5', clipboard.copied && 'text-primary')}
        />
      </Button>
    </Tooltip>
  )
}

function PromptImage(props: {
  itemId: string
  index: number
  mediaType: string
  data: string | null
}) {
  const selection = useStore((state) => state.selection)
  const machine = selection?.machine ?? null
  const sessionId = selection?.sessionId ?? null
  const [loaded, setLoaded] = useState<string | null>(null)

  useEffect(() => {
    if (props.data !== null || machine === null || sessionId === null) {return}
    let current = true
    call(machine, 'sessions.image', {
      sessionId,
      itemId: props.itemId,
      index: props.index,
    })
      .then((result) => {
        if (current) {setLoaded(result.data)}
      })
      .catch(showError)
    return () => {
      current = false
    }
  }, [props.data, props.itemId, props.index, machine, sessionId])

  const data = props.data ?? loaded
  if (data === null) {return null}
  return (
    <img
      src={`data:${props.mediaType};base64,${data}`}
      alt=""
      className="block size-full object-cover"
    />
  )
}
