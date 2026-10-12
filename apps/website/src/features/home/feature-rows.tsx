import { cn } from '@/lib/utils'

const features = [
  {
    title: 'Groups and tabs',
    description:
      'A tab for every task, a group for every project. Give each group its own logo.',
    color: 'group-hover:text-ansi-blue',
    band: 'bg-ansi-blue',
  },
  {
    title: 'Shells that keep running',
    description:
      'Close the browser and open it again. Your terminals are still there, mid-command.',
    color: 'group-hover:text-ansi-green',
    band: 'bg-ansi-green',
  },
  {
    title: 'Images in the terminal',
    description:
      'Sixel and iTerm2 inline images, on Windows too. Windows Terminal shows sixel but not iTerm2 images.',
    color: 'group-hover:text-ansi-magenta',
    band: 'bg-ansi-magenta',
  },
  {
    title: 'Paste images',
    description:
      'Paste an image and sshtty saves it to a file and types its path. Claude Code and OpenCode pick it up directly.',
    color: 'group-hover:text-ansi-yellow',
    band: 'bg-ansi-yellow',
  },
  {
    title: 'Built for coding agents',
    description:
      'Run Claude Code, OpenCode or any other terminal app, each in its own tab.',
    color: 'group-hover:text-ansi-cyan',
    band: 'bg-ansi-cyan',
  },
  {
    title: 'Works on your phone',
    description: 'The layout adapts to small screens.',
    color: 'group-hover:text-ansi-red',
    band: 'bg-ansi-red',
  },
  {
    title: 'The usual comforts',
    description:
      'Search, clickable links, a large scrollback and a settings page for shell, font, cursor and padding.',
    color: 'group-hover:text-foreground',
    band: 'bg-foreground',
  },
]

export function FeatureRows() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-32">
      <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
        Every shell, right where you left it.
      </h2>
      <ul className="mt-16 border-t">
        {features.map((feature) => (
          <li
            key={feature.title}
            className="group relative grid gap-3 overflow-hidden border-b py-8 md:grid-cols-12 md:items-center md:gap-8"
          >
            <div
              className={cn(
                'absolute inset-0 origin-left scale-x-0 opacity-10 transition-transform duration-500 ease-out group-hover:scale-x-100 motion-reduce:transition-none',
                feature.band
              )}
            />
            <h3
              className={cn(
                'relative text-3xl font-semibold tracking-tight transition-[color,translate] duration-300 group-hover:translate-x-3 sm:text-5xl md:col-span-7',
                feature.color
              )}
            >
              {feature.title}
            </h3>
            <p className="text-muted-foreground relative text-lg md:col-span-5">
              {feature.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
