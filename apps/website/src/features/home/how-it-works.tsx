import { SessionTimeline } from './session-timeline'

export function HowItWorks() {
  return (
    <section className="mx-2 mt-3 rounded-3xl border bg-[linear-gradient(to_bottom,color-mix(in_srgb,var(--c2)_8%,transparent),transparent_70%)] sm:mx-3">
      <div className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
        <div className="grid gap-6 lg:grid-cols-2 lg:items-end lg:gap-16">
          <h2 className="font-mono text-3xl font-semibold tracking-tighter text-balance sm:text-5xl">
            Closing the tab doesn&apos;t close the shell.
          </h2>
          <p className="text-muted-foreground max-w-lg text-lg">
            Your shells run inside sshtty, on your machine. The browser only
            shows them. Close it, reopen it later, and every terminal is where
            you left it.
          </p>
        </div>
        <SessionTimeline className="bg-background/60 mt-14" />
      </div>
    </section>
  )
}
