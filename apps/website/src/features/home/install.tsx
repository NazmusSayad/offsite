import { AsciiLogo } from './ascii-logo'
import { CopyCommand } from './copy-command'

export function Install() {
  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center px-6 pt-24 pb-16 text-center sm:pt-32">
      <h2 className="sr-only">Install sshtty</h2>
      <AsciiLogo className="max-w-xs sm:max-w-md" />
      <div className="mt-10">
        <CopyCommand large />
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
      <p className="text-muted-foreground mt-3 text-sm">
        macOS, Linux and Windows. No account. MIT licensed.
      </p>
    </section>
  )
}
