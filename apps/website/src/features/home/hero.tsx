import Image from 'next/image'
import { siGithub, siNpm } from 'simple-icons'
import { Button } from '@/components/ui/button'
import { BrandIcon } from './brand-icon'
import { CopyCommand } from './copy-command'
import { FlowLines } from './flow-lines'
import { githubUrl, npmUrl } from './links'
import { Logo } from './logo'

export function Hero() {
  return (
    <>
      <nav className="flex items-center justify-between px-4 py-3 sm:px-6">
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

      <section className="corner-marks border-t">
        <div className="flex flex-col items-center px-6 pt-20 text-center sm:pt-28">
          <h1 className="text-5xl leading-[1.02] font-semibold tracking-[-0.045em] text-balance sm:text-7xl">
            A terminal in your browser.
            <span className="text-muted-foreground block">
              Your shells keep running.
            </span>
          </h1>
          <p className="text-muted-foreground mt-8 max-w-xl text-lg text-pretty">
            Groups and tabs for every project. Close the browser, come back
            later, and every shell is still there, mid-command.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
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

        <div className="relative isolate mx-auto max-w-5xl px-4 pt-20 pb-4 sm:px-6 sm:pb-6">
          <FlowLines className="top-1/4 h-80 -translate-y-1/2 sm:h-[600px]" />
          <div className="bg-card/60 rounded-2xl border p-1.5 shadow-[0_40px_160px_-40px_color-mix(in_srgb,var(--c4)_40%,transparent)] backdrop-blur">
            <Image
              src="/screenshots/desktop.webp"
              alt="sshtty in a browser, with a git log in the first of three tabs"
              width={2880}
              height={1800}
              sizes="(min-width: 1024px) 1012px, 100vw"
              preload
              className="rounded-xl"
            />
          </div>
        </div>
      </section>
    </>
  )
}
