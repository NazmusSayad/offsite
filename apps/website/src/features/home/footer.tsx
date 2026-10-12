import { githubUrl, npmUrl } from './links'

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t">
      <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-6 px-6 pt-12 text-sm sm:flex-row sm:justify-between">
        <p>sshtty is in its early stages and actively maintained.</p>
        <nav className="flex gap-6">
          <a href={githubUrl} className="hover:text-foreground">
            GitHub
          </a>
          <a href={npmUrl} className="hover:text-foreground">
            npm
          </a>
          <a
            href={`${githubUrl}/blob/main/LICENSE`}
            className="hover:text-foreground"
          >
            MIT License
          </a>
        </nav>
      </div>
      <p
        aria-hidden
        className="animate-gradient mt-8 -mb-[0.22em] bg-[linear-gradient(90deg,var(--c4),var(--c5),var(--c1),var(--c3),var(--c2),var(--c6),var(--c4))] bg-size-[200%_auto] bg-clip-text text-center font-mono text-[24vw] leading-none font-bold tracking-tighter text-transparent select-none motion-reduce:animate-none"
      >
        sshtty
      </p>
    </footer>
  )
}
