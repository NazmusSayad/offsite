import {
  type CSSProperties,
  lazy,
  type ReactNode,
  Suspense,
  useState,
} from 'react'
import { cn } from '@/lib/utils'

const FileViewer = lazy(async () => ({
  default: (await import('@/components/file-viewer')).FileViewer,
}))

export function ViewableImage(props: {
  src: string
  alt: string
  name: string
  className?: string
  style?: CSSProperties
  imageClassName?: string
  actions?: ReactNode
  onError?: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label={props.alt === '' ? 'View image' : `View ${props.alt}`}
        className={cn(
          'focus-visible:ring-ring cursor-zoom-in rounded-lg outline-none focus-visible:ring-2',
          props.className
        )}
        style={props.style}
        onClick={() => setOpen(true)}
      >
        <img
          src={props.src}
          alt={props.alt}
          loading="lazy"
          decoding="async"
          className={props.imageClassName}
          onError={props.onError}
        />
      </button>
      {open && (
        <Suspense>
          <FileViewer
            name={props.name}
            load={async () => ({ kind: 'image', src: props.src })}
            actions={props.actions}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
