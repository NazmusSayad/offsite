'use client'

import { Volume2Icon, VolumeXIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)

  function handleToggleSound() {
    const video = videoRef.current
    if (!video) return
    video.muted = !muted
    if (muted) video.currentTime = 0
    setMuted(!muted)
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        src="/demo.mp4"
        poster="/demo-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="A one-minute tour of sshtty"
        className="aspect-video w-full rounded-xl border bg-black shadow-[0_40px_120px_-40px_color-mix(in_srgb,var(--c4)_45%,transparent)]"
      />
      <Button
        variant="secondary"
        size="icon-lg"
        onClick={handleToggleSound}
        aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
        className="absolute bottom-4 left-4 rounded-full bg-black/60 backdrop-blur hover:bg-black/80"
      >
        {muted ? <VolumeXIcon /> : <Volume2Icon />}
      </Button>
    </div>
  )
}
