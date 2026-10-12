import Image from 'next/image'
import { siGithub, siNpm } from 'simple-icons'
import { Button } from '@/components/ui/button'
import { AsciiLogo } from './ascii-logo'
import { BrandIcon } from './brand-icon'
import { CopyCommand } from './copy-command'
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

      <section className="mx-2 overflow-hidden rounded-3xl border bg-[radial-gradient(90%_60%_at_70%_0%,color-mix(in_srgb,var(--c4)_14%,transparent),transparent)] sm:mx-3">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-16 sm:pt-20 lg:grid-cols-2 lg:gap-16">
          <div className="max-lg:order-last">
            <h1 className="font-mono text-4xl leading-[1.05] font-semibold tracking-tighter text-balance sm:text-6xl">
              A terminal that outlives the tab.
            </h1>
            <p className="text-muted-foreground mt-8 max-w-lg text-lg text-pretty">
              sshtty is a terminal in your browser, with groups and tabs. Close
              the tab, come back tomorrow, and every shell is still running,
              mid-command.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
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
          <AsciiLogo className="mx-auto max-w-sm lg:max-w-lg" />
        </div>

        <div className="mx-auto mt-20 max-w-6xl px-6 sm:mt-24">
          <Image
            src="/screenshots/desktop.webp"
            alt="sshtty in a browser, with a git log in the first of three tabs"
            width={2880}
            height={1800}
            sizes="(min-width: 1152px) 1104px, 100vw"
            preload
            className="rounded-t-xl border border-b-0 shadow-[0_-30px_120px_-40px_color-mix(in_srgb,var(--c4)_35%,transparent)]"
          />
        </div>
      </section>
    </>
  )
}
