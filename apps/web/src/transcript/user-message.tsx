import {
  CheckIcon,
  CopyIcon,
  PencilEdit02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Block } from '@server/protocol'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useCopy } from '@/lib/clipboard'
import { clock, fullTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Markdown } from '@/markdown/markdown'
import type { RewindTarget } from '@/transcript/rewind-dialog'

const fade =
  'linear-gradient(to bottom, black calc(100% - 1.75rem), transparent)'

export function UserMessage(props: {
  uuid: string
  time: number | null
  blocks: Block[]
  first: boolean
  running: boolean
  rewind: boolean
  onRewind: (target: RewindTarget) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const prompt = props.blocks
    .flatMap((block) => {
      if (block.type !== 'text') return []
      const shown = userText(block.text)
      return shown.kind === 'text' ? [shown.text] : []
    })
    .join('\n')
  const images = props.blocks.flatMap((block) =>
    block.type === 'image' ? [block] : []
  )
  const parts: ReactNode[] = props.blocks.flatMap((block, index) => {
    if (block.type !== 'text') return []
    const shown = userText(block.text)
    switch (shown.kind) {
      case 'command':
        return [
          <span key={index} className="font-mono text-sm">
            {shown.text}
          </span>,
        ]
      case 'output':
        return [
          <pre
            key={index}
            className="text-muted-foreground font-mono text-xs whitespace-pre-wrap"
          >
            {shown.text}
          </pre>,
        ]
      case 'text':
        return [
          <Markdown
            key={index}
            text={shown.text}
            className="text-foreground"
            lineBreaks
            rawHtml={false}
          />,
        ]
    }
  })
  if (parts.length === 0 && images.length === 0) return null
  const canCollapse =
    prompt.trim() !== '' &&
    (prompt.length > 600 || prompt.split('\n').length > 8)
  const collapsed = canCollapse && !expanded
  return (
    <div className="group flex flex-col items-end gap-1">
      <div className="bg-message text-message-foreground relative max-w-[80%] rounded-2xl px-3 py-2">
        {images.length > 0 && (
          <div className="mb-2 grid max-w-[210px] grid-cols-2 gap-2">
            {images.map((image, index) => (
              <div
                key={index}
                className="border-border/80 bg-background/70 aspect-[4/3] overflow-hidden rounded-lg border"
              >
                <img
                  src={`data:${image.mediaType};base64,${image.data}`}
                  alt=""
                  className="block size-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
        {parts.length > 0 && (
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
              {parts}
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
          {props.time !== null && (
            <Tooltip label={fullTime(props.time)}>
              <p className="text-muted-foreground text-xs tabular-nums">
                {clock(props.time)}
              </p>
            </Tooltip>
          )}
          {prompt !== '' && (
            <div className="flex items-center gap-0.5">
              {props.rewind && (
                <Tooltip label="Edit from here">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label="Edit from here"
                    disabled={props.running}
                    onClick={() =>
                      props.onRewind({
                        messageId: props.uuid,
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

function userText(text: string): {
  kind: 'command' | 'output' | 'text'
  text: string
} {
  const command = /<command-name>(.*?)<\/command-name>/s.exec(text)
  if (command !== null) {
    const args = /<command-args>(.*?)<\/command-args>/s.exec(text)
    return { kind: 'command', text: `${command[1]} ${args?.[1] ?? ''}`.trim() }
  }
  const output =
    /^<local-command-(?:stdout|stderr)>(.*)<\/local-command-(?:stdout|stderr)>$/s.exec(
      text.trim()
    )
  if (output !== null) return { kind: 'output', text: output[1] }
  return { kind: 'text', text }
}
