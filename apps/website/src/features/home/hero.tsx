import { siGithub, siNpm } from 'simple-icons'
import { Button } from '@/components/ui/button'
import { BrandIcon } from './brand-icon'
import { CopyCommand } from './copy-command'
import { DemoVideo } from './demo-video'
import { githubUrl, npmUrl } from './links'
import { Logo } from './logo'

export function Hero() {
  return (
    <>
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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

      <section className="mx-2 overflow-hidden rounded-3xl border bg-[radial-gradient(80%_60%_at_50%_0%,color-mix(in_srgb,var(--c4)_16%,transparent),transparent)] sm:mx-3">
        <div className="mx-auto flex max-w-4xl flex-col items-center px-6 pt-20 text-center sm:pt-28">
          <h1 className="font-mono text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-7xl">
            A terminal that outlives the tab.
          </h1>
          <p className="text-muted-foreground mt-8 max-w-2xl text-lg text-pretty">
            sshtty is a terminal in your browser that runs on your own machine.
            Put Claude Code in one tab and your dev server in another, a group
            per project.
          </p>
          <div className="mt-10">
            <CopyCommand />
          </div>
        </div>

        <div className="mx-auto mt-16 max-w-6xl px-2 sm:mt-20 sm:px-6">
          <DemoVideo className="overflow-hidden rounded-t-xl border border-b-0 shadow-[0_-30px_120px_-40px_color-mix(in_srgb,var(--c4)_45%,transparent)]" />
        </div>
      </section>
    </>
  )
}
