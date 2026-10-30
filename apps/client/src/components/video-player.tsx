import {
  MediaControlBar,
  MediaController,
  MediaFullscreenButton,
  MediaLoadingIndicator,
  MediaMuteButton,
  MediaPipButton,
  MediaPlayButton,
  MediaPlaybackRateButton,
  MediaSeekBackwardButton,
  MediaSeekForwardButton,
  MediaTimeDisplay,
  MediaTimeRange,
  MediaVolumeRange,
} from 'media-chrome/react'

export function VideoPlayer(props: { src: string; label: string }) {
  return (
    <MediaController className="size-full outline-none [--media-background-color:black] [--media-control-background:transparent] [--media-control-hover-background:rgb(255_255_255/12%)] [--media-font-family:inherit] [--media-range-track-border-radius:9999px]">
      <video
        slot="media"
        src={props.src}
        aria-label={props.label}
        autoPlay
        playsInline
        preload="auto"
        className="size-full object-contain"
      />
      <MediaLoadingIndicator slot="centered-chrome" noAutohide />
      <MediaControlBar className="w-full bg-linear-to-t from-black/70 to-transparent px-2 pt-6 pb-1 *:p-2.5 max-sm:flex-wrap max-sm:*:p-2">
        <MediaPlayButton />
        <MediaSeekBackwardButton seekOffset={10} />
        <MediaSeekForwardButton seekOffset={10} />
        <MediaTimeRange className="grow max-sm:order-first max-sm:min-h-0 max-sm:basis-full" />
        <MediaTimeDisplay showDuration className="max-sm:mr-auto" />
        <MediaMuteButton />
        <MediaVolumeRange className="max-sm:hidden" />
        <MediaPlaybackRateButton />
        <MediaPipButton className="max-sm:hidden" />
        <MediaFullscreenButton />
      </MediaControlBar>
    </MediaController>
  )
}
