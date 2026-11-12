import {
  Download01Icon,
  Link04Icon,
  Notification01Icon,
  PlusSignIcon,
  ServerStack01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import Image from 'next/image'

const features = [
  {
    icon: Link04Icon,
    title: 'Pair with one link',
    text: 'Run offsite pair and open the link on your phone. Browsers that are not paired are refused.',
  },
  {
    icon: Notification01Icon,
    title: 'Notifications',
    text: 'Get a push when an agent or a terminal needs you, even with no OffSite tab open.',
  },
  {
    icon: Download01Icon,
    title: 'Install it as an app',
    text: 'Add OffSite to your home screen. It opens offline too.',
  },
  {
    icon: ServerStack01Icon,
    title: 'More than one machine',
    text: 'Pair your laptop and your desktop, and switch between them from the sidebar.',
  },
]

export function Mobile() {
  return (
    <section className="px-6 py-12 md:py-16">
      <div className="mesh-dusk grain mx-auto grid max-w-6xl items-center overflow-hidden rounded-[2rem] md:grid-cols-2">
        <div className="order-2 flex justify-center px-6 pt-4 md:order-1 md:pt-16">
          <Image
            src="/app-mobile.webp"
            width={1179}
            height={1977}
            sizes="320px"
            alt="OffSite on a phone, with a thread open above the composer"
            className="phone reveal -mb-24 w-64 md:-mb-32 md:w-80"
          />
        </div>
        <div className="order-1 px-6 pt-12 sm:px-10 md:order-2 md:py-16 md:pr-16 md:pl-0">
          <h2 className="reveal text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-balance md:text-5xl">
            Check in from anywhere.
          </h2>
          <p className="reveal text-muted mt-5 text-lg leading-relaxed [--delay:100ms]">
            The whole app fits a phone screen, so a long task does not keep you
            at your desk.
          </p>
          <div className="reveal mt-8 flex flex-col items-start gap-3 [--delay:160ms]">
            {features.map((feature) => (
              <details
                key={feature.title}
                className="group bg-surface/80 ring-line max-w-md rounded-3xl shadow-[0_10px_30px_-18px_rgb(0_0_0/40%)] ring-1 backdrop-blur"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 py-3 pr-3 pl-4 font-medium [&::-webkit-details-marker]:hidden">
                  <HugeiconsIcon icon={feature.icon} className="size-5" />
                  {feature.title}
                  <span className="bg-foreground/8 ml-2 grid size-6 place-items-center rounded-full transition-transform group-open:rotate-45">
                    <HugeiconsIcon icon={PlusSignIcon} className="size-3.5" />
                  </span>
                </summary>
                <p className="text-muted px-4 pb-4 leading-relaxed">
                  {feature.text}
                </p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
