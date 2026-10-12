import { BotIcon, LayersIcon, SearchIcon, ServerIcon } from 'lucide-react'
import Image from 'next/image'

const features = [
  {
    icon: BotIcon,
    title: 'Built for coding agents',
    description:
      'Run Claude Code or OpenCode in its own tab. Paste an image and sshtty saves it and types the path.',
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
    <section className="corner-marks border-t">
      <div className="grid gap-6 px-6 py-20 sm:px-12 sm:py-28 lg:grid-cols-2 lg:items-end lg:gap-16">
        <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Made for terminals
          <span className="text-muted-foreground"> you leave open.</span>
        </h2>
        <p className="text-muted-foreground max-w-md text-lg">
          The long-running ones: a dev server, a coding agent, a build you check
          on from your phone.
        </p>
      </div>

      <ul className="bg-border grid gap-px border-t sm:grid-cols-2 lg:grid-cols-3">
        <li className="bg-background flex flex-col overflow-hidden pt-8 pl-8 sm:col-span-2">
          <div className="pr-8">
            <h3 className="text-lg font-medium">Images in the terminal</h3>
            <p className="text-muted-foreground mt-2 max-w-md">
              Sixel and iTerm2 inline images, on Windows too, where Windows
              Terminal only shows sixel.
            </p>
          </div>
          <Image
            src="/screenshots/inline-image.webp"
            alt="An image printed inline in an sshtty tab"
            width={1520}
            height={1040}
            sizes="(min-width: 1024px) 720px, 100vw"
            className="mt-8 rounded-tl-xl border-t border-l"
          />
        </li>

        <li className="bg-background flex flex-col overflow-hidden px-8 pt-8 sm:row-span-2">
          <h3 className="text-lg font-medium">Works on your phone</h3>
          <p className="text-muted-foreground mt-2">
            The layout adapts to small screens, with keys for Esc, Tab, Ctrl and
            the arrows.
          </p>
          <div className="relative mt-8 min-h-[28rem] flex-1">
            <div className="absolute inset-y-0 left-1/2 flex aspect-[1170/2532] -translate-x-1/2 rounded-t-[2rem] border border-b-0 p-1.5 pb-0">
              <Image
                src="/screenshots/phone.webp"
                alt="sshtty on a phone"
                width={1170}
                height={2532}
                sizes="320px"
                className="rounded-t-[1.6rem] object-cover object-top"
              />
            </div>
          </div>
        </li>

        {features.map((feature) => (
          <li
            key={feature.title}
            className="bg-background p-8 lg:last:col-span-2"
          >
            <feature.icon className="text-primary size-5" />
            <h3 className="mt-5 text-lg font-medium">{feature.title}</h3>
            <p className="text-muted-foreground mt-2 max-w-md">
              {feature.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
