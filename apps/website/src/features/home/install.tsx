import { CopyCommand } from './copy-command'

export function Install() {
  return (
    <section className="mx-2 mt-3 flex flex-col items-center rounded-3xl border bg-[radial-gradient(70%_80%_at_50%_100%,color-mix(in_srgb,var(--c4)_14%,transparent),transparent)] px-6 py-28 text-center sm:mx-3 sm:py-40">
      <CopyCommand className="text-foreground h-auto gap-4 bg-transparent px-0 text-4xl tracking-tight hover:bg-transparent sm:gap-6 sm:text-7xl [&_svg:not([class*='size-'])]:size-7 sm:[&_svg:not([class*='size-'])]:size-10" />
      <p className="text-muted-foreground mt-10 text-lg">
        Then open{' '}
        <a
          href="http://127.0.0.1:47831"
          className="text-foreground decoration-primary font-mono underline underline-offset-4"
        >
          127.0.0.1:47831
        </a>{' '}
        in your browser.
      </p>
      <p className="text-muted-foreground mt-3 text-sm">
        macOS, Linux and Windows. No account. MIT licensed.
      </p>
    </section>
  )
}
