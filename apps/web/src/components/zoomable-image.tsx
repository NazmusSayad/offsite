import {
  CenterFocusIcon,
  MinusSignIcon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'

export function ZoomableImage(props: { src: string; alt: string }) {
  return (
    <TransformWrapper
      minScale={1}
      maxScale={12}
      wheel={{ wheelDisabled: true }}
      trackPadPanning={{ disabled: false }}
      doubleClick={{ mode: 'toggle', step: 1.5 }}
      keyboard={{ disabled: false }}
    >
      {(controls) => (
        <div className="relative size-full">
          <TransformComponent
            wrapperClass="size-full! outline-none"
            contentClass="size-full! items-center justify-center p-4 sm:p-12"
          >
            <img
              src={props.src}
              alt={props.alt}
              draggable={false}
              className="max-h-full max-w-full object-contain select-none"
            />
          </TransformComponent>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full bg-black/60 p-1 text-white backdrop-blur-sm">
            <Tooltip label="Zoom out">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom out"
                className="rounded-full text-white hover:bg-white/15"
                onClick={() => void controls.zoomOut()}
              >
                <HugeiconsIcon
                  icon={MinusSignIcon}
                  className="size-4 text-current"
                />
              </Button>
            </Tooltip>
            <Tooltip label="Zoom in">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Zoom in"
                className="rounded-full text-white hover:bg-white/15"
                onClick={() => void controls.zoomIn()}
              >
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  className="size-4 text-current"
                />
              </Button>
            </Tooltip>
            <Tooltip label="Fit to screen">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Fit to screen"
                className="rounded-full text-white hover:bg-white/15"
                onClick={() => void controls.resetTransform()}
              >
                <HugeiconsIcon
                  icon={CenterFocusIcon}
                  className="size-4 text-current"
                />
              </Button>
            </Tooltip>
          </div>
        </div>
      )}
    </TransformWrapper>
  )
}
