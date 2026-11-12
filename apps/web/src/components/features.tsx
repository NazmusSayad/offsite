import { clsx } from 'clsx'
import Image from 'next/image'

const steps = [
  {
    title: 'Run it on your computer',
    text: 'OffSite starts next to your code and your CLIs, and prints a link.',
    code: '$ npx offsite',
  },
  {
    title: 'Open the link',
    text: 'That browser is paired, and your threads are already there.',
    code: 'http://127.0.0.1:47841/pair#…',
  },
  {
    title: 'Add your phone',
    text: 'Start it with --host, then open the pairing link on your phone.',
    code: '$ npx offsite pair --host 192.168.1.20',
  },
]

const tiles = [
  {
    image: 'feature-source-control',
    width: 1600,
    height: 660,
    title: 'Source control',
    text: 'Stage, commit and push, with a graph of your branches.',
    span: 'md:col-span-2',
  },
  {
    image: 'feature-search',
    width: 760,
    height: 640,
    title: 'Search',
    text: 'Find any thread, or any message inside one.',
    span: '',
  },
  {
    image: 'feature-rewind',
    width: 760,
    height: 640,
    title: 'Rewind and fork',
    text: 'Restore the chat, the code or both to any message.',
    span: '',
  },
  {
    image: 'feature-editor',
    width: 1600,
    height: 660,
    title: 'Editor',
    text: 'A full code editor with tabs and a file explorer.',
    span: 'md:col-span-2',
  },
  {
    image: 'feature-browser',
    width: 1380,
    height: 570,
    title: 'Browser',
    text: 'Open your dev server next to the chat. URLs load from your machine.',
    span: 'md:col-span-2',
  },
  {
    image: 'feature-composer',
    width: 760,
    height: 640,
    title: 'Composer',
    text: 'Dictate, queue messages, stash a prompt or compact the context.',
    span: '',
  },
  {
    image: 'feature-usage',
    width: 900,
    height: 758,
    title: 'Usage',
    text: 'See how much of your Claude and Codex limits is left.',
    span: '',
  },
  {
    image: 'feature-terminal',
    width: 1700,
    height: 660,
    title: 'Terminal',
    text: 'Real terminals with tabs, right under the chat.',
    span: 'md:col-span-2',
  },
  {
    image: 'feature-settings',
    width: 1790,
    height: 740,
    title: 'Themes and settings',
    text: 'Ten themes, your own fonts, and settings for each provider.',
    span: 'md:col-span-2',
  },
  {
    image: 'feature-models',
    width: 760,
    height: 640,
    title: 'Models',
    text: 'Switch the model and effort from the message box.',
    span: 'md:col-span-2 lg:col-span-1',
  },
]

export function Steps() {
  return (
    <section className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal text-center text-4xl font-semibold tracking-[-0.035em] text-balance md:text-5xl">
          Get started in three steps
        </h2>
        <ol className="mt-14 grid gap-4 md:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.title}
              style={{ '--delay': `${index * 80}ms` } as React.CSSProperties}
              className="reveal bg-surface ring-line flex min-w-0 flex-col rounded-(--radius) p-6 ring-1"
            >
              <span className="bg-foreground text-background grid size-7 place-items-center rounded-(--radius) font-mono text-xs">
                {index + 1}
              </span>
              <h3 className="mt-6 text-lg font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="text-muted mt-2 leading-relaxed">{step.text}</p>
              <code className="bg-background ring-line mt-6 truncate rounded-(--radius) px-3 py-2.5 font-mono text-[13px] ring-1">
                {step.code}
              </code>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export function Features() {
  return (
    <section className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="reveal text-4xl font-semibold tracking-[-0.035em] text-balance md:text-5xl">
            Your whole desk, in one tab
          </h2>
          <p className="reveal text-muted mt-5 text-lg leading-relaxed text-balance">
            Code, git, a terminal and a browser, next to every thread.
          </p>
        </div>
        <ul className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <li
              key={tile.image}
              className={clsx(
                'reveal bg-surface ring-line flex h-[22rem] flex-col overflow-hidden rounded-(--radius) ring-1 md:h-[24rem]',
                tile.span
              )}
            >
              <div className="p-6 pb-5">
                <h3 className="text-lg font-semibold tracking-tight">
                  {tile.title}
                </h3>
                <p className="text-muted mt-2 leading-relaxed">{tile.text}</p>
              </div>
              <div className="relative ml-6 min-h-0 flex-1 overflow-hidden rounded-tl-(--radius) bg-[#15181c] ring-1 ring-black/10 dark:ring-white/10">
                <Image
                  src={`/${tile.image}.webp`}
                  width={tile.width}
                  height={tile.height}
                  sizes="(min-width: 1024px) 760px, 100vw"
                  alt={tile.title}
                  className="absolute top-0 left-0 h-full w-full object-cover object-left-top"
                />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
