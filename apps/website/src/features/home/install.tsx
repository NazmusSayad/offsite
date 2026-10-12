import { CopyCommand } from './copy-command'

export function Install() {
  return (
    <section className="mx-auto flex max-w-3xl flex-col items-center px-6 py-32 text-center">
      <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Run it with npx.
      </h2>
      <CopyCommand className="mt-10 h-16 px-7 text-xl" />
      <p className="text-muted-foreground mt-6 text-lg">
        Then open{' '}
        <a
          href="http://127.0.0.1:47831"
          className="text-foreground decoration-primary font-mono underline underline-offset-4"
        >
          127.0.0.1:47831
        </a>{' '}
        in your browser.
      </p>
      <dl className="mt-16 grid w-full max-w-lg grid-cols-3 gap-6 border-t pt-8 text-sm">
        <div>
          <dt className="text-muted-foreground">macOS</dt>
          <dd className="mt-1">Apple Silicon, Intel</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Linux</dt>
          <dd className="mt-1">x64, arm64</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Windows</dt>
          <dd className="mt-1">x64</dd>
        </div>
      </dl>
    </section>
  )
}
