import { PreviewDialog, PreviewHeader } from '@/components/preview-dialog'
import { VideoPlayer } from '@/components/video-player'

export function VideoViewer(props: {
  src: string
  label: string
  name: string
  onClose: () => void
}) {
  return (
    <PreviewDialog open onClose={props.onClose}>
      <PreviewHeader title={props.name} />
      <div
        className="min-h-0 flex-1"
        onClick={(event) => {
          if (
            event.target instanceof HTMLVideoElement &&
            outsideFrame(event.target, event.clientX, event.clientY)
          ) {
            props.onClose()
          }
        }}
      >
        <VideoPlayer src={props.src} label={props.label} />
      </div>
    </PreviewDialog>
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
