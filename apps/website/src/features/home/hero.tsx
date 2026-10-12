import Image from 'next/image'
import { siGithub, siNpm } from 'simple-icons'
import { Button } from '@/components/ui/button'
import { BrandIcon } from './brand-icon'
import { CopyCommand } from './copy-command'
import { githubUrl, npmUrl } from './links'
import { Logo } from './logo'
import { SessionTimeline } from './session-timeline'

export function Hero() {
  return (
    <>
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

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-24 sm:pt-24 sm:pb-32">
        <div className="grid gap-8 lg:grid-cols-[1.7fr_1fr] lg:items-end lg:gap-12">
          <h1 className="text-5xl leading-[0.95] font-semibold tracking-[-0.05em] text-balance sm:text-7xl xl:text-8xl">
            A terminal that outlives the tab.
          </h1>
          <div>
            <p className="text-muted-foreground text-lg text-pretty">
              sshtty is a terminal in your browser, with groups and tabs. Close
              the tab, come back tomorrow, and every shell is still running,
              mid-command.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CopyCommand />
              <Button
                variant="outline"
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
        </div>
        <SessionTimeline className="mt-20" />
      </section>

      <section className="border-t bg-(--bg) pt-16 transition-colors duration-700 sm:pt-24">
        <div className="mx-auto max-w-6xl px-6">
          <Image
            src="/screenshots/desktop.webp"
            alt="sshtty in a browser, with a git log in the first of three tabs"
            width={2880}
            height={1800}
            sizes="(min-width: 1152px) 1104px, 100vw"
            className="rounded-t-xl border border-b-0 shadow-[0_-30px_120px_-40px_color-mix(in_srgb,var(--c4)_35%,transparent)]"
          />
        </div>
      </section>
    </>
  )
}
