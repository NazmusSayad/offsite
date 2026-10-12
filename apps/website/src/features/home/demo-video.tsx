'use client'

import { PlayIcon, Volume2Icon, VolumeXIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

async function playVideo(video: HTMLVideoElement) {
  try {
    await video.play()
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return
    if (error instanceof DOMException && error.name === 'NotAllowedError')
      return
    throw error
  }
}

export function DemoVideo(props: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const mutedState = useState(true)
  const muted = mutedState[0]
  const playingState = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) throw new Error('The video is not mounted')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!window.matchMedia('(min-width: 640px)').matches) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          void playVideo(video)
        } else {
          video.pause()
        }
      },
      { threshold: 0.25 }
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  function handleToggleSound() {
    const video = videoRef.current
    if (!video) throw new Error('The video is not mounted')
    video.muted = !muted
    if (muted) {
      video.currentTime = 0
      void playVideo(video)
    }
    mutedState[1](!muted)
  }

  function handleTogglePlay() {
    const video = videoRef.current
    if (!video) throw new Error('The video is not mounted')
    if (video.paused) {
      void playVideo(video)
      return
    }
    video.pause()
  }

  return (
    <div className={cn('relative', props.className)}>
      <video
        ref={videoRef}
        src="/tour.mp4"
        poster="/tour-poster.jpg"
        muted
        loop
        playsInline
        preload="none"
        aria-label="A one-minute tour of sshtty"
        onClick={handleTogglePlay}
        onPlay={() => playingState[1](true)}
        onPause={() => playingState[1](false)}
        className="aspect-video w-full cursor-pointer bg-black"
      />
      {!playingState[0] && (
        <Button
          variant="secondary"
          onClick={handleTogglePlay}
          aria-label="Play the tour"
          className="absolute top-1/2 left-1/2 size-16 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 backdrop-blur hover:bg-black/80 [&_svg]:size-7"
        >
          <PlayIcon className="fill-current" />
        </Button>
      )}
      <Button
        variant="secondary"
        size="icon-lg"
        onClick={handleToggleSound}
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        className="absolute bottom-4 left-4 rounded-full bg-black/60 backdrop-blur hover:bg-black/80"
      >
        {muted && <VolumeXIcon />}
        {!muted && <Volume2Icon />}
      </Button>
    </div>
  )
}
