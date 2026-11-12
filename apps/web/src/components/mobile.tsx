import {
  Download01Icon,
  Link04Icon,
  Notification01Icon,
  ServerStack01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Phone } from './phone'

const features = [
  {
    icon: Link04Icon,
    title: 'Pair with one link',
    text: 'Run offsite pair and open the link on your phone. Browsers that are not paired are refused.',
  },
  {
    icon: Notification01Icon,
    title: 'Push when it needs you',
    text: 'Get a notification when an agent or a terminal needs you, even with no OffSite tab open.',
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
    <section className="px-6 py-16 md:py-24">
      <div className="mx-auto grid max-w-6xl items-center gap-14 md:grid-cols-2 md:gap-20">
        <div className="reveal bg-surface ring-line flex justify-center overflow-hidden rounded-(--radius) px-6 pt-12 ring-1 md:pt-16">
          <Phone className="-mb-24 w-64 md:w-72" />
        </div>
        <div>
          <h2 className="reveal text-4xl font-semibold tracking-[-0.035em] text-balance md:text-5xl">
            Answer it from your phone
          </h2>
          <p className="reveal text-muted mt-5 text-lg leading-relaxed">
            When the agent asks something, you answer, and it keeps going.
          </p>
          <ul className="mt-10 flex flex-col gap-7">
            {features.map((feature) => (
              <li key={feature.title} className="reveal flex gap-4">
                <HugeiconsIcon
                  icon={feature.icon}
                  className="text-accent mt-0.5 size-5 shrink-0"
                />
                <div>
                  <h3 className="font-semibold tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="text-muted mt-1 leading-relaxed">
                    {feature.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
