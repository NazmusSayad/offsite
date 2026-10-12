import Image from 'next/image'

const highlights = [
  {
    image: '/screenshots/agent-paste.webp',
    width: 1340,
    height: 720,
    alt: 'OpenCode in an sshtty tab, with a pasted image attached to the prompt as a file',
    title: 'Paste screenshots into your agent',
    description:
      'Run Claude Code, OpenCode or any other terminal app. Paste an image and sshtty saves it to a file and types the path, so the agent can open it.',
  },
  {
    image: '/screenshots/imgcat.webp',
    width: 1330,
    height: 640,
    alt: 'A landscape picture printed inline by imgcat in an sshtty tab',
    title: 'Images print right in the terminal',
    description:
      'Sixel and iTerm2 inline images both work, on Windows too, where Windows Terminal shows sixel but not iTerm2 images.',
  },
]

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-mono text-3xl font-semibold tracking-tighter text-balance sm:text-5xl">
          A group for every project, a tab for every task.
        </h2>
        <p className="text-muted-foreground mx-auto mt-6 max-w-2xl text-lg text-pretty">
          Give each group a logo and switch with a click. The same groups open
          on your phone, with keys for Esc, Tab, Ctrl and the arrows.
        </p>
      </div>

      <div className="relative mt-16 pb-12 sm:pb-20">
        <Image
          src="/screenshots/workspace.webp"
          alt="sshtty with three groups in the sidebar and three tabs: cargo build, vim and btop"
          width={2560}
          height={1600}
          sizes="(min-width: 1152px) 950px, 86vw"
          className="w-[86%] rounded-xl border shadow-2xl"
        />
        <div className="bg-background absolute right-0 bottom-0 w-[24%] rounded-[1.25rem] border p-1 shadow-2xl sm:rounded-[2rem] sm:p-1.5">
          <Image
            src="/screenshots/phone-vim.webp"
            alt="sshtty on a phone, with a row of keys for Esc, Tab, the arrows and Ctrl"
            width={1170}
            height={2532}
            sizes="(min-width: 1152px) 270px, 24vw"
            className="rounded-[1rem] sm:rounded-[1.6rem]"
          />
        </div>
      </div>

      <div className="mt-20 grid gap-x-10 gap-y-14 md:grid-cols-2">
        {highlights.map((highlight) => (
          <div key={highlight.title}>
            <Image
              src={highlight.image}
              alt={highlight.alt}
              width={highlight.width}
              height={highlight.height}
              sizes="(min-width: 768px) 540px, 100vw"
              className="aspect-[16/9] w-full rounded-xl border object-cover object-left-top"
            />
            <h3 className="mt-6 text-xl font-medium">{highlight.title}</h3>
            <p className="text-muted-foreground mt-2 max-w-md">
              {highlight.description}
            </p>
          </div>
        ))}
      </div>

      <p className="text-muted-foreground mt-16 max-w-3xl border-t pt-8">
        <span className="text-foreground">Also in the box:</span> search,
        clickable links, a large scrollback, settings for shell, font, cursor
        and padding, and several sshtty servers on different ports sharing one
        set of groups.
      </p>
    </section>
  )
}
