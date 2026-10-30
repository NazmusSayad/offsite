import {
  MediaControlBar,
  MediaController,
  MediaMuteButton,
  MediaPlayButton,
  MediaPlaybackRateButton,
  MediaTimeDisplay,
  MediaTimeRange,
} from 'media-chrome/react'
import { cn } from '@/lib/utils'

export function AudioPlayer(props: {
  src: string
  label: string
  className?: string
  onError?: () => void
}) {
  return (
    <span
      className={cn(
        'border-border bg-muted inline-flex rounded-lg border align-top',
        props.className
      )}
    >
      <MediaController
        audio
        className="w-full rounded-lg outline-none [--media-background-color:transparent] [--media-control-background:transparent] [--media-control-hover-background:var(--accent)] [--media-font-family:inherit] [--media-primary-color:var(--foreground)] [--media-range-bar-color:var(--primary)] [--media-range-thumb-background:var(--primary)] [--media-range-track-background:var(--border)] [--media-range-track-border-radius:9999px] [--media-secondary-color:transparent] [--media-text-color:var(--muted-foreground)] [--media-time-range-buffered-color:var(--border)]"
      >
        <audio
          slot="media"
          src={props.src}
          aria-label={props.label}
          preload="metadata"
          onError={props.onError}
        />
        <MediaControlBar className="w-full px-1 pb-1 *:p-2">
          <MediaPlayButton />
          <MediaTimeRange className="grow" />
          <MediaTimeDisplay showDuration />
          <MediaMuteButton />
          <MediaPlaybackRateButton />
        </MediaControlBar>
      </MediaController>
    </span>
  )
}
