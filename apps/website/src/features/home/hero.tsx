import { siGithub, siNpm } from 'simple-icons'
import { Button } from '@/components/ui/button'
import { BrandIcon } from './brand-icon'
import { CopyCommand } from './copy-command'
import { GlyphField } from './glyph-field'
import { githubUrl, npmUrl } from './links'
import { Logo } from './logo'

export function Hero() {
  return (
    <section className="relative flex min-h-svh flex-col">
      <div className="absolute inset-0 bg-[radial-gradient(45%_40%_at_15%_20%,color-mix(in_srgb,var(--c5)_32%,transparent),transparent),radial-gradient(45%_45%_at_85%_70%,color-mix(in_srgb,var(--c4)_30%,transparent),transparent),radial-gradient(35%_30%_at_60%_10%,color-mix(in_srgb,var(--c6)_20%,transparent),transparent)]" />
      <GlyphField />
      <div className="to-background pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent" />

      <nav className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <a href="/" className="flex items-center gap-2.5 font-mono text-lg">
          <Logo className="text-primary size-7" />
          sshtty
        </a>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-lg" asChild>
            <a href={npmUrl} aria-label="sshtty on npm">
              <BrandIcon icon={siNpm} className="size-5" />
            </a>
          </Button>
          <Button variant="ghost" size="icon-lg" asChild>
            <a href={githubUrl} aria-label="sshtty on GitHub">
              <BrandIcon icon={siGithub} className="size-5" />
            </a>
          </Button>
        </div>
      </nav>

      <div className="pointer-events-none relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 pb-24 text-center">
        <h1 className="text-[clamp(3rem,10vw,8.5rem)] leading-[0.9] font-semibold tracking-[-0.055em] text-balance">
          Shells that{' '}
          <span className="animate-gradient bg-[linear-gradient(90deg,var(--c4),var(--c5),var(--c1),var(--c3),var(--c2),var(--c6),var(--c4))] bg-size-[200%_auto] bg-clip-text text-transparent motion-reduce:animate-none">
            outlive
          </span>{' '}
          the tab.
        </h1>
        <p className="text-muted-foreground mt-8 max-w-xl text-lg text-pretty sm:text-xl">
          sshtty puts a terminal in your browser, with groups and tabs. Close
          the browser, come back tomorrow, and every shell is still there,
          mid-command.
        </p>
        <div className="pointer-events-auto mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <CopyCommand />
          <Button
            variant="ghost"
            className="h-12 gap-2 rounded-xl px-5 text-base"
            asChild
          >
            <a href={githubUrl}>
              <BrandIcon icon={siGithub} className="size-4" />
              Star on GitHub
            </a>
          </Button>
        </div>
        <p className="text-muted-foreground mt-6 font-mono text-xs">
          macOS · Linux · Windows · MIT licensed
        </p>
      </div>
    </section>
  )
}
