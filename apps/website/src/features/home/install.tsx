import { CopyCommand } from './copy-command'
import { DemoVideo } from './demo-video'

export function Install() {
  return (
    <section className="mx-2 mt-3 rounded-3xl border bg-[radial-gradient(70%_80%_at_20%_100%,color-mix(in_srgb,var(--c4)_14%,transparent),transparent)] sm:mx-3">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 sm:py-32 lg:grid-cols-[2fr_3fr] lg:gap-16">
        <div>
          <CopyCommand className="text-foreground h-auto gap-4 bg-transparent px-0 text-4xl tracking-tight hover:bg-transparent sm:text-6xl [&_svg:not([class*='size-'])]:size-7 sm:[&_svg:not([class*='size-'])]:size-9" />
          <p className="text-muted-foreground mt-8 text-lg">
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
        </div>
        <DemoVideo />
      </div>
    </section>
  )
}
