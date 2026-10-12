'use client'

import { Volume2Icon, VolumeXIcon } from 'lucide-react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function DemoFilm() {
  const sectionRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const reducedMotion = useReducedMotion()
  const scroll = useScroll({
    target: sectionRef,
    offset: ['start end', 'center center'],
  })
  const rotateX = useTransform(scroll.scrollYProgress, [0, 1], [32, 0])
  const scale = useTransform(scroll.scrollYProgress, [0, 1], [0.8, 1])

  function handleToggleSound() {
    const video = videoRef.current
    if (!video) return
    video.muted = !muted
    if (muted) video.currentTime = 0
    setMuted(!muted)
  }

  return (
    <section
      ref={sectionRef}
      className="relative mx-auto max-w-6xl px-6 pt-8 pb-32 perspective-[1600px]"
    >
      <div className="mb-8 flex items-end justify-between gap-6">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          The one-minute tour
        </h2>
        <Button
          variant="outline"
          onClick={handleToggleSound}
          className="gap-2 rounded-full"
        >
          {muted ? <VolumeXIcon /> : <Volume2Icon />}
          {muted ? 'Sound on' : 'Sound off'}
        </Button>
      </div>

      <motion.div
        style={reducedMotion ? undefined : { rotateX, scale }}
        className="relative origin-top"
      >
        <div className="absolute -inset-8 -z-10 overflow-hidden rounded-[3rem] opacity-50 blur-3xl">
          <div className="animate-spin-slow absolute top-1/2 left-1/2 aspect-square w-[150%] -translate-1/2 bg-[conic-gradient(var(--c4),var(--c5),var(--c1),var(--c3),var(--c2),var(--c6),var(--c4))] motion-reduce:animate-none" />
        </div>
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
          className="aspect-video w-full rounded-2xl border bg-black shadow-2xl"
        />
      </motion.div>
    </section>
  )
}
