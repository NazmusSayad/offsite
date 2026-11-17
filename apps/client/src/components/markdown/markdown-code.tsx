import {
  CheckIcon,
  CopyIcon,
  SourceCodeIcon,
  TextWrapIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { memo, useRef, useState } from 'react'
import { bundledLanguagesInfo } from 'shiki/langs'
import { Highlight } from '@/components/markdown/highlight'
import { LanguageIcon } from '@/components/markdown/language-icon'
import {
  DiagramContextMenu,
  DiagramViewerActions,
} from '@/components/markdown/media-menu'
import { MermaidDiagram } from '@/components/markdown/mermaid'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useCopy } from '@/lib/clipboard'

export const CodeBlock = memo(CodeBlockView)

function CodeBlockView(props: {
  code: string
  language: string
  open: boolean
}) {
  const [wrap, setWrap] = useState(true)
  const [source, setSource] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  const diagram = useRef<HTMLButtonElement>(null)
  const clipboard = useCopy()
  const language = languageInfo(props.language)
  const drawable =
    props.language === 'mermaid' &&
    !props.open &&
    props.code.trim() !== '' &&
    failed !== props.code
  const wrapLabel = wrap ? 'Disable line wrap' : 'Wrap lines'
  const copyLabel = clipboard.copied ? 'Copied' : 'Copy code'

  if (drawable && !source) {
    return (
      <DiagramContextMenu
        subject={{ code: props.code, diagram }}
        onShowCode={() => setSource(true)}
      >
        <div className="my-[0.65rem]">
          <MermaidDiagram
            ref={diagram}
            code={props.code}
            actions={
              <DiagramViewerActions subject={{ code: props.code, diagram }} />
            }
            onError={setFailed}
          />
        </div>
      </DiagramContextMenu>
    )
  }

  return (
    <div
      className="chat-markdown-codeblock border-border/70 bg-secondary dark:bg-input/32 my-[0.65rem] overflow-hidden rounded-lg border leading-snug dark:border-transparent"
      data-language={props.language}
      data-wrap={wrap}
    >
      <div className="chat-markdown-codeblock-header flex items-center justify-between gap-2 pt-1.5 pr-1.5 pb-0 pl-3 select-none">
        <span className="text-2xs inline-flex min-w-0 items-center gap-2 font-mono">
          <LanguageIcon
            language={language?.id ?? props.language.toLowerCase()}
          />
          <span className="truncate">
            {props.language === 'mermaid'
              ? 'Mermaid Diagram'
              : (language?.name ?? props.language)}
          </span>
        </span>
        <span className="flex items-center gap-0.5" role="toolbar">
          {drawable && (
            <Tooltip label="Show diagram">
              <Button
                type="button"
                variant="secondary"
                size="icon-micro"
                aria-pressed
                aria-label="Show diagram"
                onClick={() => setSource(false)}
              >
                <HugeiconsIcon icon={SourceCodeIcon} className="size-4" />
              </Button>
            </Tooltip>
          )}
          <Tooltip label={wrapLabel}>
            <Button
              type="button"
              variant={wrap ? 'secondary' : 'ghost-muted'}
              size="icon-micro"
              aria-pressed={wrap}
              aria-label={wrapLabel}
              onClick={() => setWrap(!wrap)}
            >
              <HugeiconsIcon icon={TextWrapIcon} className="size-4" />
            </Button>
          </Tooltip>
          <Tooltip label={copyLabel}>
            <Button
              type="button"
              variant="ghost-muted"
              size="icon-micro"
              aria-label={copyLabel}
              onClick={() => void clipboard.copy(props.code)}
            >
              <HugeiconsIcon
                icon={clipboard.copied ? CheckIcon : CopyIcon}
                className="size-4"
              />
            </Button>
          </Tooltip>
        </span>
      </div>
      <Highlight code={props.code} language={props.language} />
    </div>
  )
}

function languageInfo(language: string) {
  const normalized = language.toLowerCase()
  return bundledLanguagesInfo.find(
    (item) => item.id === normalized || item.aliases?.includes(normalized)
  )
}
