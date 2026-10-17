import { lazy, Suspense, useState } from 'react'
import { cn } from '@/lib/utils'

const ImageViewer = lazy(async () => ({
  default: (await import('@/components/image-viewer')).ImageViewer,
}))

export function ViewableImage(props: {
  src: string
  alt: string
  name: string
  className?: string
  imageClassName?: string
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
          <ImageViewer
            src={props.src}
            alt={props.alt}
            name={props.name}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      )}
    </>
  )
}
