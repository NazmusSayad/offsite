import {
  BotIcon,
  ImageIcon,
  LayersIcon,
  SearchIcon,
  ServerIcon,
  SmartphoneIcon,
} from 'lucide-react'
import Image from 'next/image'

const features = [
  {
    icon: ImageIcon,
    title: 'Images in the terminal',
    description:
      'Sixel and iTerm2 inline images, on Windows too, where Windows Terminal only shows sixel.',
  },
  {
    icon: BotIcon,
    title: 'Built for coding agents',
    description:
      'Run Claude Code or OpenCode in its own tab. Paste an image and sshtty saves it and types the path.',
  },
  {
    icon: SmartphoneIcon,
    title: 'Works on your phone',
    description:
      'The layout adapts to small screens, with keys for Esc, Tab, Ctrl and the arrows.',
  },
  {
    icon: LayersIcon,
    title: 'Groups and tabs',
    description:
      'A tab for every task, a group for every project. Give each group its own logo.',
  },
  {
    icon: ServerIcon,
    title: 'Several servers, one set of groups',
    description: 'Run sshtty on different ports and they share groups.',
  },
  {
    icon: SearchIcon,
    title: 'The usual comforts',
    description:
      'Search, clickable links, a large scrollback and settings for shell, font, cursor and padding.',
  },
]

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <h2 className="max-w-2xl font-mono text-3xl font-semibold tracking-tighter text-balance sm:text-5xl">
        Made for terminals you leave open.
      </h2>

      <div className="relative mt-16 pb-10 sm:pb-16">
        <Image
          src="/screenshots/inline-image.webp"
          alt="An image printed inline in an sshtty tab"
          width={1520}
          height={1040}
          sizes="(min-width: 1152px) 880px, 80vw"
          className="w-[80%] rounded-xl border"
        />
        <div className="bg-background absolute right-0 bottom-0 w-[27%] rounded-[1.25rem] border p-1 shadow-2xl sm:rounded-[2rem] sm:p-1.5">
          <Image
            src="/screenshots/phone.webp"
            alt="sshtty on a phone"
            width={1170}
            height={2532}
            sizes="(min-width: 1152px) 300px, 27vw"
            className="rounded-[1rem] sm:rounded-[1.6rem]"
          />
        </div>
      </div>

      <ul className="mt-16 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <li key={feature.title} className="border-t pt-6">
            <feature.icon className="text-primary size-5" />
            <h3 className="mt-4 text-lg font-medium">{feature.title}</h3>
            <p className="text-muted-foreground mt-2">{feature.description}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
