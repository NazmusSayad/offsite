import { CopyCommand } from './copy-command'
import { FlowLines } from './flow-lines'

export function Install() {
  return (
    <section className="corner-marks isolate flex flex-col items-center border-t px-6 py-28 text-center sm:py-36">
      <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
        Run it with npx.
        <span className="text-muted-foreground block">Leave it running.</span>
      </h2>
      <div className="relative mt-14">
        <FlowLines className="top-1/2 h-72 -translate-y-1/2 max-sm:hidden" />
        <CopyCommand className="h-16 px-7 text-xl" />
      </div>
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
    </section>
  )
}
