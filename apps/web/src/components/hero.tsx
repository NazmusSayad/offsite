import {
  ChatGptIcon,
  GithubIcon,
  SmartPhone01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { GITHUB_URL, NPM_URL } from '@/lib/layout'
import { CopyCommand } from './copy-command'
import { ClaudeIcon, OpenCodeIcon } from './icons'
import { BrowserFrame, TerminalFrame } from './window-frame'

export function SiteHeader() {
  return (
    <header className="sticky top-3 z-30 px-3">
      <div className="bg-background/60 ring-line mx-auto flex h-14 max-w-6xl items-center justify-between rounded-full pr-2 pl-5 shadow-[0_8px_30px_-12px_rgb(0_0_0/25%)] ring-1 backdrop-blur-xl">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight"
        >
          <img src="/icon.svg" alt="" className="size-6" />
          OffSite
        </Link>
        <nav className="text-muted flex items-center gap-1 text-sm">
          <Link
            href="/docs"
            className="hover:text-foreground rounded-full px-3 py-1.5 transition-colors"
          >
            Docs
          </Link>
          <a
            href={NPM_URL}
            className="hover:text-foreground hidden rounded-full px-3 py-1.5 transition-colors sm:block"
          >
            npm
          </a>
          <a
            href={GITHUB_URL}
            className="bg-foreground text-background ml-2 flex items-center gap-2 rounded-full px-4 py-2 transition-opacity hover:opacity-90"
          >
            <HugeiconsIcon icon={GithubIcon} className="size-4" />
            GitHub
          </a>
        </nav>
      </div>
    </header>
  )
}

export function Hero() {
  return (
    <section className="relative px-6 pt-16 md:pt-24">
      <div
        aria-hidden="true"
        className="mesh-glow pointer-events-none absolute inset-x-0 -top-16 h-[52rem] blur-2xl [mask-image:linear-gradient(to_bottom,black_35%,transparent)]"
      />
      <div className="relative mx-auto max-w-4xl text-center">
        <h1 className="text-[2.5rem] leading-[1.06] font-medium tracking-[-0.04em] text-balance md:text-[4.25rem]">
          <span className="whitespace-nowrap">
            Claude Code
            <InlineMark>
              <ClaudeIcon className="size-[0.62em]" />
            </InlineMark>
            <span className="-ml-[0.1em]">,</span>
          </span>{' '}
          <span className="whitespace-nowrap">
            Codex
            <InlineMark>
              <HugeiconsIcon icon={ChatGptIcon} className="size-[0.62em]" />
            </InlineMark>
          </span>{' '}
          and{' '}
          <span className="whitespace-nowrap">
            OpenCode
            <InlineMark>
              <OpenCodeIcon className="h-[0.56em]" />
            </InlineMark>
          </span>{' '}
          <span className="text-foreground/55 block">in your browser.</span>
        </h1>
        <p className="text-foreground/65 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-balance">
          OffSite opens the same sessions as their CLIs. Start a task in the
          terminal, check on it from your phone, and finish it back at your
          desk.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <CopyCommand />
          <Link
            href="/docs"
            className="bg-surface/70 ring-line hover:bg-surface flex h-11 items-center rounded-full px-5 text-sm font-medium ring-1 backdrop-blur transition-colors"
          >
            Read the docs
          </Link>
        </div>
        <p className="text-foreground/45 mt-4 text-[13px]">
          Runs on your machine · Free and MIT licensed
        </p>
      </div>

      <div className="relative mx-auto mt-16 max-w-5xl md:mt-20">
        <BrowserFrame className="[mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
          <Image
            src="/app-hero.webp"
            width={2880}
            height={1800}
            priority
            sizes="(min-width: 1024px) 1024px, 100vw"
            alt="OffSite in a browser: the thread list on the left, a Claude Code thread in the middle, and the composer with model and effort pickers at the bottom"
            className="aspect-[16/10] w-full object-cover object-left-top"
          />
        </BrowserFrame>
        <TerminalFrame className="absolute top-24 -left-16 hidden w-80 xl:block">
          <p>
            <span className="text-[#f5b544]">$</span> claude
          </p>
          <p className="text-[#9aa0a8]">
            <span className="text-[#666c75]">&gt;</span> Add a download button
            to the file preview
          </p>
          <p className="text-[#666c75]">
            Working
            <span
              aria-hidden="true"
              className="blink ml-1 inline-block h-[1.05em] w-[0.5em] translate-y-[0.2em] rounded-[1px] bg-[#f5b544]"
            />
          </p>
        </TerminalFrame>
        <Image
          src="/app-mobile.webp"
          width={1179}
          height={1977}
          sizes="200px"
          alt="The same thread on a phone"
          className="phone absolute top-[30%] -right-2 w-28 sm:w-36 md:-right-12 md:w-44"
        />
      </div>

      <ul className="border-line relative mx-auto grid max-w-5xl grid-cols-2 gap-x-6 gap-y-6 border-t pt-6 text-sm md:-mt-10 md:grid-cols-4">
        <li>
          <p className="flex items-center gap-2 font-medium">
            <ClaudeIcon className="size-4" />
            Claude Code
          </p>
          <p className="text-subtle mt-1">
            Same sessions as <code className="font-mono">claude</code>
          </p>
        </li>
        <li>
          <p className="flex items-center gap-2 font-medium">
            <HugeiconsIcon icon={ChatGptIcon} className="size-4" />
            Codex
          </p>
          <p className="text-subtle mt-1">
            Same sessions as <code className="font-mono">codex</code>
          </p>
        </li>
        <li>
          <p className="flex items-center gap-2 font-medium">
            <OpenCodeIcon className="h-4" />
            OpenCode
          </p>
          <p className="text-subtle mt-1">
            Same sessions as <code className="font-mono">opencode</code>
          </p>
        </li>
        <li>
          <p className="flex items-center gap-2 font-medium">
            <HugeiconsIcon icon={SmartPhone01Icon} className="size-4" />
            Your phone
          </p>
          <p className="text-subtle mt-1">Paired with one link</p>
        </li>
      </ul>
    </section>
  )
}

function InlineMark(props: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="bg-surface ring-line mx-[0.12em] inline-grid size-[0.95em] translate-y-[-0.06em] place-items-center rounded-[0.24em] align-middle shadow-[0_8px_20px_-10px_rgb(0_0_0/35%)] ring-1"
    >
      {props.children}
    </span>
  )
}
