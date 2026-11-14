import { AudioPlayer } from '@/components/audio-player'
import { PreviewDialog, PreviewHeader } from '@/components/preview-dialog'
import { VideoPlayer } from '@/components/video-player'
import { ZoomableImage } from '@/components/zoomable-image'
import { type Preview, usePreview } from '@/lib/preview'

export function FileViewer(props: {
  name: string
  load: () => Promise<Preview>
  onClose: () => void
}) {
  return (
    <PreviewDialog open onClose={props.onClose}>
      <PreviewHeader title={props.name} />
      <div className="min-h-0 flex-1">
        <ViewerBody
          name={props.name}
          load={props.load}
          onClose={props.onClose}
        />
      </div>
    </PreviewDialog>
  )
}

function ViewerBody(props: {
  name: string
  load: () => Promise<Preview>
  onClose: () => void
}) {
  const preview = usePreview(props.load)
  if (preview === null) {
    return null
  }
  if (preview.kind === 'error') {
    return (
      <p className="text-muted-foreground grid size-full place-items-center p-4 text-sm">
        {preview.message}
      </p>
    )
  }
  if (preview.kind === 'text') {
    return (
      <pre className="size-full overflow-auto p-4 font-mono text-xs leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap">
        {preview.text}
      </pre>
    )
  }
  if (preview.kind === 'image') {
    return (
      <ZoomableImage
        src={preview.src}
        alt={props.name}
        onClose={props.onClose}
      />
    )
  }
  if (preview.kind === 'video') {
    return (
      <div
        className="size-full"
        onClick={(event) => {
          if (
            event.target instanceof HTMLVideoElement &&
            outsideFrame(event.target, event.clientX, event.clientY)
          ) {
            props.onClose()
          }
        }}
      >
        <VideoPlayer src={preview.src} label={props.name} />
      </div>
    )
  }
  return (
    <div className="grid size-full place-items-center p-4">
      <AudioPlayer
        src={preview.src}
        label={props.name}
        className="w-full max-w-xl"
      />
    </div>
  )
}

function outsideFrame(video: HTMLVideoElement, x: number, y: number) {
  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return false
  }
  const box = video.getBoundingClientRect()
  const scale = Math.min(
    box.width / video.videoWidth,
    box.height / video.videoHeight
  )
  return (
    Math.abs(x - box.left - box.width / 2) > (video.videoWidth * scale) / 2 ||
    Math.abs(y - box.top - box.height / 2) > (video.videoHeight * scale) / 2
  )
}
