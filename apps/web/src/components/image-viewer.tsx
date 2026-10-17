import { PreviewDialog, PreviewHeader } from '@/components/preview-dialog'
import { ZoomableImage } from '@/components/zoomable-image'

export function ImageViewer(props: {
  src: string
  alt: string
  name: string
  onClose: () => void
}) {
  return (
    <PreviewDialog open onClose={props.onClose}>
      <PreviewHeader title={props.name} />
      <div className="min-h-0 flex-1">
        <ZoomableImage src={props.src} alt={props.alt} />
      </div>
    </PreviewDialog>
  )
}
