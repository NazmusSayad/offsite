import {
  BotIcon,
  ImageIcon,
  LayersIcon,
  SearchIcon,
  ServerIcon,
  SmartphoneIcon,
} from 'lucide-react'

const features = [
  {
    icon: LayersIcon,
    title: 'Groups and tabs',
    description:
      'A tab for every task, a group for every project. Give each group its own logo.',
  },
  {
    icon: BotIcon,
    title: 'Built for coding agents',
    description:
      'Run Claude Code or OpenCode in its own tab. Paste an image and sshtty saves it and types the path.',
  },
  {
    icon: ImageIcon,
    title: 'Images in the terminal',
    description:
      'Sixel and iTerm2 inline images, on Windows too, where Windows Terminal only shows sixel.',
  },
  {
    icon: SmartphoneIcon,
    title: 'Works on your phone',
    description: 'The layout adapts to small screens.',
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
    <section className="mx-auto max-w-6xl px-6 pb-32">
      <h2 className="mx-auto max-w-2xl text-center text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        Made for terminals you leave open.
      </h2>
      <ul className="bg-border mt-16 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <li key={feature.title} className="bg-background p-8">
            <feature.icon className="text-primary size-5" />
            <h3 className="mt-5 text-lg font-medium">{feature.title}</h3>
            <p className="text-muted-foreground mt-2">{feature.description}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
