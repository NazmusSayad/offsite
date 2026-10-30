import {
  CheckIcon,
  CopyIcon,
  SourceCodeIcon,
  TextWrapIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import {
  FileTypeIcon,
  hasLanguageIcon,
  languageFileName,
} from '@/components/file-icon'
import { Highlight } from '@/components/markdown/highlight'
import { MermaidDiagram, useMermaid } from '@/components/markdown/mermaid'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useCopy } from '@/lib/clipboard'

export function CodeBlock(props: { code: string; language: string }) {
  const [wrap, setWrap] = useState(true)
  const [source, setSource] = useState(false)
  const svg = useMermaid(props.language === 'mermaid' ? props.code : null)
  const clipboard = useCopy()
  const wrapLabel = wrap ? 'Disable line wrap' : 'Wrap lines'
  const sourceLabel = source ? 'Show diagram' : 'Show code'
  const copyLabel = clipboard.copied ? 'Copied' : 'Copy code'
  return (
    <div
      className="chat-markdown-codeblock border-border/70 bg-secondary dark:bg-input/32 my-[0.65rem] overflow-hidden rounded-lg border leading-snug dark:border-transparent"
      data-language={props.language}
      data-wrap={wrap}
    >
      <div className="chat-markdown-codeblock-header flex items-center justify-between gap-2 pt-1.5 pr-1.5 pb-0 pl-3 select-none">
        <span className="text-2xs inline-flex min-w-0 items-center gap-1.5 font-mono">
          {hasLanguageIcon(props.language) ? (
            <Tooltip label={props.language}>
              <span
                className="inline-flex shrink-0 rounded-sm"
                aria-label={`Language: ${props.language}`}
              >
                <FileTypeIcon
                  path={languageFileName(props.language)}
                  className="size-3.5"
                />
              </span>
            </Tooltip>
          ) : (
            <span className="truncate">{props.language}</span>
          )}
        </span>
        <span className="flex items-center gap-0.5" role="toolbar">
          {svg !== null && (
            <Tooltip label={sourceLabel}>
              <Button
                type="button"
                variant={source ? 'secondary' : 'ghost-muted'}
                size="icon-xs"
                aria-pressed={source}
                aria-label={sourceLabel}
                onClick={() => setSource(!source)}
              >
                <HugeiconsIcon icon={SourceCodeIcon} className="size-3" />
              </Button>
            </Tooltip>
          )}
          {(svg === null || source) && (
            <Tooltip label={wrapLabel}>
              <Button
                type="button"
                variant={wrap ? 'secondary' : 'ghost-muted'}
                size="icon-xs"
                aria-pressed={wrap}
                aria-label={wrapLabel}
                onClick={() => setWrap(!wrap)}
              >
                <HugeiconsIcon icon={TextWrapIcon} className="size-3" />
              </Button>
            </Tooltip>
          )}
          <Tooltip label={copyLabel}>
            <Button
              type="button"
              variant="ghost-muted"
              size="icon-xs"
              aria-label={copyLabel}
              onClick={() => void clipboard.copy(props.code)}
            >
              <HugeiconsIcon
                icon={clipboard.copied ? CheckIcon : CopyIcon}
                className="size-3"
              />
            </Button>
          </Tooltip>
        </span>
      </div>
      {svg !== null && !source ? (
        <MermaidDiagram svg={svg} />
      ) : (
        <Highlight code={props.code} language={props.language} />
      )}
    </div>
  )
}
