import {
  CheckIcon,
  CopyIcon,
  Download01Icon,
  FullScreenIcon,
  SourceCodeIcon,
  TextWrapIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, useState } from 'react'
import { bundledLanguagesInfo } from 'shiki/langs'
import {
  downloadImage,
  elementImage,
  imageFormats,
} from '@/components/markdown/export-image'
import { Highlight } from '@/components/markdown/highlight'
import { LanguageIcon } from '@/components/markdown/language-icon'
import { MermaidDiagram, useMermaid } from '@/components/markdown/mermaid'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import { useCopy } from '@/lib/clipboard'
import { saveBlob } from '@/lib/media'
import { showError } from '@/lib/store'

export function CodeBlock(props: { code: string; language: string }) {
  const [wrap, setWrap] = useState(true)
  const [source, setSource] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const diagram = useRef<HTMLButtonElement>(null)
  const language = languageInfo(props.language)
  const svg = useMermaid(props.language === 'mermaid' ? props.code : null)
  const clipboard = useCopy()
  const wrapLabel = wrap ? 'Disable line wrap' : 'Wrap lines'
  const sourceLabel = source ? 'Show diagram' : 'Show code'
  const copyLabel = clipboard.copied ? 'Copied' : 'Copy code'
  const copyDiagramLabel = clipboard.copied ? 'Copied' : 'Copy diagram'
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
          {svg !== null && !source ? (
            <>
              <Tooltip label="Fullscreen">
                <Button
                  type="button"
                  variant="ghost-muted"
                  size="icon-xs"
                  aria-label="Fullscreen"
                  onClick={() => setFullscreen(true)}
                >
                  <HugeiconsIcon icon={FullScreenIcon} className="size-3" />
                </Button>
              </Tooltip>
              <DropdownMenu>
                <Tooltip label="Download diagram">
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost-muted"
                      size="icon-xs"
                      aria-label="Download diagram"
                    >
                      <HugeiconsIcon icon={Download01Icon} className="size-3" />
                    </Button>
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-auto">
                  <DropdownMenuItem
                    onSelect={() =>
                      saveBlob(
                        new Blob([props.code], {
                          type: 'text/plain;charset=utf-8',
                        }),
                        'mermaid-diagram.mmd'
                      )
                    }
                  >
                    Download as Code
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      saveBlob(
                        new Blob([svg], { type: 'image/svg+xml' }),
                        'mermaid-diagram.svg'
                      )
                    }
                  >
                    Download as SVG
                  </DropdownMenuItem>
                  {imageFormats.map((format) => (
                    <DropdownMenuItem
                      key={format.type}
                      onSelect={() =>
                        void downloadImage(
                          diagram.current,
                          format,
                          'mermaid-diagram'
                        ).catch(showError)
                      }
                    >
                      Download as {format.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <Tooltip label={copyDiagramLabel}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost-muted"
                      size="icon-xs"
                      aria-label={copyDiagramLabel}
                    >
                      <HugeiconsIcon
                        icon={clipboard.copied ? CheckIcon : CopyIcon}
                        className="size-3"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                </Tooltip>
                <DropdownMenuContent align="end" className="w-auto">
                  <DropdownMenuItem
                    onSelect={() => void clipboard.copy(props.code)}
                  >
                    Copy as Code
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void clipboard.copy(svg)}>
                    Copy as SVG
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      void clipboard.copyImage(
                        elementImage(diagram.current, 'image/png')
                      )
                    }
                  >
                    Copy as PNG
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
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
          )}
        </span>
      </div>
      {svg !== null && !source ? (
        <MermaidDiagram
          ref={diagram}
          svg={svg}
          open={fullscreen}
          onOpenChange={setFullscreen}
        />
      ) : (
        <Highlight code={props.code} language={props.language} />
      )}
    </div>
  )
}

function languageInfo(language: string) {
  const normalized = language.toLowerCase()
  return bundledLanguagesInfo.find(
    (item) => item.id === normalized || item.aliases?.includes(normalized)
  )
}
