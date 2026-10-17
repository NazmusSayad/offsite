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
      <MediaControlBar className="w-full bg-linear-to-t from-black/70 to-transparent px-2 pt-6 pb-1 *:p-2.5">
        <MediaPlayButton />
        <MediaSeekBackwardButton seekOffset={10} />
        <MediaSeekForwardButton seekOffset={10} />
        <MediaTimeRange className="grow" />
        <MediaTimeDisplay showDuration />
        <MediaMuteButton />
        <MediaVolumeRange />
        <MediaPlaybackRateButton />
        <MediaPipButton />
        <MediaFullscreenButton />
      </MediaControlBar>
    </MediaController>
  )
}
