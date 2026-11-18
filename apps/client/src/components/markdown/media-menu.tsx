import {
  CheckIcon,
  CopyIcon,
  Download01Icon,
  FileLinkIcon,
  Image01Icon,
  Link01Icon,
  SourceCodeIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react'
import { mediaTypes } from '@offsite/core/media'
import type { ReactNode, RefObject } from 'react'
import { imageFormats } from '@/components/markdown/export-image'
import { diagramImage, diagramSvg } from '@/components/markdown/mermaid'
import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
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

export type MediaSubject = {
  src: string
  kind: 'image' | 'video' | 'audio'
  address: string | null
  local: boolean
}

export type DiagramSubject = {
  code: string
  diagram: RefObject<HTMLButtonElement | null>
}

export function MediaContextMenu(props: {
  subject: MediaSubject
  children: ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{props.children}</ContextMenuTrigger>
      <ContextMenuContent>
        <MediaMenuItems subject={props.subject} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function MediaViewerActions(props: { subject: MediaSubject }) {
  const clipboard = useCopy()
  const path = useCopy()
  const subject = props.subject
  const address = subject.address
  return (
    <span className="ml-auto flex items-center gap-1">
      {subject.kind === 'image' && (
        <ActionButton
          label="Copy Image"
          icon={CopyIcon}
          copied={clipboard.copied}
          onClick={() => void clipboard.copyImage(pngImage(subject.src))}
        />
      )}
      {address !== null && (
        <ActionButton
          label={subject.local ? 'Copy Path' : 'Copy Link'}
          icon={subject.local ? FileLinkIcon : Link01Icon}
          copied={path.copied}
          onClick={() => void path.copy(address)}
        />
      )}
      <ActionButton
        label="Download"
        icon={Download01Icon}
        copied={false}
        onClick={() => void download(subject).catch(showError)}
      />
    </span>
  )
}

export function DiagramContextMenu(props: {
  subject: DiagramSubject
  onShowCode: () => void
  children: ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{props.children}</ContextMenuTrigger>
      <ContextMenuContent>
        <DiagramMenuItems
          subject={props.subject}
          onShowCode={props.onShowCode}
        />
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function DiagramViewerActions(props: { subject: DiagramSubject }) {
  const clipboard = useCopy()
  return (
    <span className="ml-auto flex items-center gap-1">
      <DropdownMenu>
        <ActionMenuTrigger label="Copy" copied={clipboard.copied} />
        <DropdownMenuContent align="end" className="w-auto">
          <DiagramCopyItems
            context={false}
            subject={props.subject}
            onCopy={clipboard.copy}
            onCopyImage={clipboard.copyImage}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <ActionMenuTrigger label="Download" copied={false} />
        <DropdownMenuContent align="end" className="w-auto">
          <DiagramDownloadItems context={false} subject={props.subject} />
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

function ActionButton(props: {
  label: string
  icon: IconSvgElement
  copied: boolean
  onClick: () => void
}) {
  const label = props.copied ? 'Copied' : props.label
  return (
    <Tooltip label={label} side="bottom">
      <Button
        type="button"
        variant="ghost-muted"
        size="icon-sm"
        aria-label={label}
        onClick={props.onClick}
      >
        <HugeiconsIcon
          icon={props.copied ? CheckIcon : props.icon}
          className="size-4"
        />
      </Button>
    </Tooltip>
  )
}

function ActionMenuTrigger(props: {
  label: 'Copy' | 'Download'
  copied: boolean
}) {
  const label = props.copied ? 'Copied' : props.label
  return (
    <Tooltip label={label} side="bottom">
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost-muted"
          size="icon-sm"
          aria-label={label}
        >
          <HugeiconsIcon
            icon={
              props.copied
                ? CheckIcon
                : props.label === 'Copy'
                  ? CopyIcon
                  : Download01Icon
            }
            className="size-4"
          />
        </Button>
      </DropdownMenuTrigger>
    </Tooltip>
  )
}

function MediaMenuItems(props: { subject: MediaSubject }) {
  const clipboard = useCopy()
  const subject = props.subject
  const address = subject.address
  return (
    <>
      {subject.kind === 'image' && (
        <ContextMenuItem
          onSelect={() => void clipboard.copyImage(pngImage(subject.src))}
        >
          <HugeiconsIcon icon={Image01Icon} />
          Copy Image
        </ContextMenuItem>
      )}
      {subject.kind === 'image' && address !== null && <ContextMenuSeparator />}
      {address !== null && (
        <ContextMenuItem onSelect={() => void clipboard.copy(address)}>
          <HugeiconsIcon icon={subject.local ? FileLinkIcon : Link01Icon} />
          {subject.local ? 'Copy Path' : 'Copy Link'}
        </ContextMenuItem>
      )}
      {(subject.kind === 'image' || address !== null) && (
        <ContextMenuSeparator />
      )}
      <ContextMenuItem onSelect={() => void download(subject).catch(showError)}>
        <HugeiconsIcon icon={Download01Icon} />
        Download
      </ContextMenuItem>
    </>
  )
}

function DiagramMenuItems(props: {
  subject: DiagramSubject
  onShowCode: () => void
}) {
  const clipboard = useCopy()
  return (
    <>
      <ContextMenuItem onSelect={props.onShowCode}>
        <HugeiconsIcon icon={SourceCodeIcon} />
        Show Code
      </ContextMenuItem>
      <ContextMenuSeparator />
      <DiagramCopyItems
        context
        subject={props.subject}
        onCopy={clipboard.copy}
        onCopyImage={clipboard.copyImage}
      />
      <ContextMenuSeparator />
      <DiagramDownloadItems context subject={props.subject} />
    </>
  )
}

function DiagramCopyItems(props: {
  context: boolean
  subject: DiagramSubject
  onCopy: (text: string) => Promise<void>
  onCopyImage: (image: Promise<Blob>) => Promise<void>
}) {
  const diagram = props.subject.diagram
  const Item = props.context ? ContextMenuItem : DropdownMenuItem
  return (
    <>
      <Item onSelect={() => void props.onCopy(props.subject.code)}>
        <HugeiconsIcon icon={CopyIcon} />
        Copy as Code
      </Item>
      <Item onSelect={() => withSvg(diagram, (svg) => void props.onCopy(svg))}>
        <HugeiconsIcon icon={CopyIcon} />
        Copy as SVG
      </Item>
      <Item
        onSelect={() =>
          void props.onCopyImage(diagramImage(diagram.current, 'image/png'))
        }
      >
        <HugeiconsIcon icon={CopyIcon} />
        Copy as PNG
      </Item>
    </>
  )
}

function DiagramDownloadItems(props: {
  context: boolean
  subject: DiagramSubject
}) {
  const diagram = props.subject.diagram
  const Item = props.context ? ContextMenuItem : DropdownMenuItem
  return (
    <>
      <Item
        onSelect={() =>
          saveBlob(
            new Blob([props.subject.code], {
              type: 'text/plain;charset=utf-8',
            }),
            'mermaid-diagram.mmd'
          )
        }
      >
        <HugeiconsIcon icon={Download01Icon} />
        Download as Code
      </Item>
      <Item
        onSelect={() =>
          withSvg(diagram, (svg) =>
            saveBlob(
              new Blob([svg], { type: 'image/svg+xml' }),
              'mermaid-diagram.svg'
            )
          )
        }
      >
        <HugeiconsIcon icon={Download01Icon} />
        Download as SVG
      </Item>
      {imageFormats.map((format) => (
        <Item
          key={format.type}
          onSelect={() =>
            void downloadDiagram(diagram, format).catch(showError)
          }
        >
          <HugeiconsIcon icon={Download01Icon} />
          Download as {format.label}
        </Item>
      ))}
    </>
  )
}

function withSvg(
  diagram: RefObject<HTMLButtonElement | null>,
  task: (svg: string) => void
) {
  try {
    task(diagramSvg(diagram.current))
  } catch (error) {
    showError(error)
  }
}

async function downloadDiagram(
  diagram: RefObject<HTMLButtonElement | null>,
  format: (typeof imageFormats)[number]
) {
  saveBlob(
    await diagramImage(diagram.current, format.type),
    `mermaid-diagram.${format.extension}`
  )
}

async function download(subject: MediaSubject) {
  const blob = await fetchBlob(subject.src)
  if (subject.local && subject.address !== null) {
    saveBlob(blob, subject.address)
    return
  }
  const extension = [...mediaTypes].find((entry) => entry[1] === blob.type)
  saveBlob(
    blob,
    extension === undefined ? subject.kind : `${subject.kind}${extension[0]}`
  )
}

async function fetchBlob(src: string) {
  const response = await fetch(src)
  if (!response.ok) {
    throw new Error(await response.text())
  }
  return await response.blob()
}

async function pngImage(src: string) {
  const blob = await fetchBlob(src)
  if (blob.type === 'image/png') {
    return blob
  }
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (context === null) {
      throw new Error('This browser cannot copy images')
    }
    context.drawImage(image, 0, 0)
    const png = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png')
    )
    if (png === null) {
      throw new Error('This browser cannot copy images')
    }
    return png
  } finally {
    URL.revokeObjectURL(url)
  }
}
