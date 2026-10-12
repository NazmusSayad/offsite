import { SessionTimeline } from './session-timeline'

export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24 sm:py-32">
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-16">
        <h2 className="font-mono text-3xl font-semibold tracking-tighter text-balance sm:text-5xl">
          Closing the tab doesn&apos;t close the shell.
        </h2>
        <div className="text-muted-foreground space-y-4 text-lg lg:pt-2">
          <p>
            Your shells run inside sshtty, not inside the page. The browser only
            shows them, so you can close it tonight and pick up mid-command
            tomorrow.
          </p>
          <p>
            They stop when sshtty stops: press Ctrl+C in its terminal or restart
            the computer.
          </p>
        </div>
      </div>
      <SessionTimeline className="mt-16" />
    </section>
  )
}
