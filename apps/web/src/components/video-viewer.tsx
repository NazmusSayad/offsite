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
      <div className="min-h-0 flex-1">
        <VideoPlayer src={props.src} label={props.label} />
      </div>
    </PreviewDialog>
  )
}
