import { siGithub, siNpm } from 'simple-icons'
import { Button } from '@/components/ui/button'
import { BrandIcon } from './brand-icon'
import { CopyCommand } from './copy-command'
import { DemoVideo } from './demo-video'
import { githubUrl, npmUrl } from './links'
import { Logo } from './logo'

export function Hero() {
  return (
    <section className="relative bg-[radial-gradient(70%_45%_at_50%_0%,color-mix(in_srgb,var(--c4)_16%,transparent),transparent)]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
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

      <div className="mx-auto flex max-w-4xl flex-col items-center px-6 pt-20 text-center sm:pt-28">
        <h1 className="text-5xl leading-[1] font-semibold tracking-[-0.045em] text-balance sm:text-7xl lg:text-8xl">
          Your shells keep running.
        </h1>
        <p className="text-muted-foreground mt-6 max-w-xl text-lg text-pretty sm:text-xl">
          sshtty is a terminal in your browser, with groups and tabs. Close the
          browser, come back later, and every shell is still there, mid-command.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
          <CopyCommand />
          <Button
            variant="ghost"
            className="h-12 gap-2 rounded-xl px-5 text-base"
            asChild
          >
            <a href={githubUrl}>
              <BrandIcon icon={siGithub} className="size-4" />
              GitHub
            </a>
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 pt-20 pb-32">
        <DemoVideo />
      </div>
    </section>
  )
}
