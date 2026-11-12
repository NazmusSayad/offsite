import { ChatGptIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import Image from 'next/image'
import Link from 'next/link'
import { GITHUB_URL } from '@/lib/layout'
import { CopyCommand } from './copy-command'
import { ClaudeIcon, OpenCodeIcon } from './icons'
import { Phone } from './phone'

export function SiteHeader() {
  return (
    <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
      <Link
        href="/"
        className="flex items-center gap-2.5 font-semibold tracking-tight"
      >
        <img src="/icon.svg" alt="" className="size-6" />
        OffSite
      </Link>
      <nav className="text-muted flex items-center gap-7 text-[15px]">
        <Link href="/docs" className="hover:text-foreground transition-colors">
          Docs
        </Link>
        <a
          href={GITHUB_URL}
          className="hover:text-foreground transition-colors"
        >
          GitHub
        </a>
      </nav>
    </header>
  )
}

export function Hero() {
  return (
    <section className="overflow-x-clip px-6 pt-16 pb-24 md:pt-24">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance md:text-[4.25rem]">
          Claude Code, Codex and OpenCode in your browser
        </h1>
        <p className="text-muted mx-auto mt-6 max-w-xl text-lg leading-relaxed text-balance">
          The same sessions as the CLI. Start a task in your terminal, check on
          it from your phone, and pick it up anywhere.
        </p>
        <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
          <CopyCommand />
          <Link
            href="/docs/getting-started"
            className="border-line bg-surface hover:bg-foreground/5 flex h-11 items-center rounded-(--radius) border px-5 text-sm font-medium shadow-xs/5 transition-colors"
          >
            Read the docs
          </Link>
        </div>
      </div>

      <div className="reveal relative mx-auto mt-16 max-w-5xl md:mt-20">
        <Image
          src="/app-hero.webp"
          width={2880}
          height={1800}
          priority
          sizes="(min-width: 1024px) 1024px, 100vw"
          alt="A thread open in OffSite in the browser"
          className="w-full rounded-(--radius) shadow-[0_40px_120px_-40px_rgb(0_0_0/45%)] ring-1 ring-black/10 dark:ring-white/10"
        />
        <div className="absolute -bottom-12 -left-14 hidden w-[34%] overflow-hidden rounded-(--radius) bg-[#15181c] shadow-[0_30px_80px_-20px_rgb(0_0_0/60%)] ring-1 ring-black/10 lg:block dark:ring-white/10">
          <div className="flex h-8 items-center gap-1.5 border-b border-white/8 px-3">
            <span className="size-2 rounded-full bg-white/15" />
            <span className="size-2 rounded-full bg-white/15" />
            <span className="size-2 rounded-full bg-white/15" />
            <span className="ml-2 font-mono text-[11px] text-white/45">
              claude --resume
            </span>
          </div>
          <div className="aspect-[4/3] overflow-hidden">
            <Image
              src="/cli-resume.webp"
              width={1286}
              height={1800}
              sizes="350px"
              alt="The same thread resumed in the Claude Code CLI"
              className="w-full"
            />
          </div>
        </div>
        <Phone className="absolute -right-3 -bottom-14 w-[24%] md:-right-12 md:w-[19%]" />
      </div>

      <div className="text-muted mx-auto mt-28 flex max-w-3xl flex-wrap items-center justify-center gap-x-10 gap-y-4 text-[15px] font-medium">
        <span className="flex items-center gap-2.5">
          <ClaudeIcon className="size-5" />
          Claude Code
        </span>
        <span className="flex items-center gap-2.5">
          <HugeiconsIcon icon={ChatGptIcon} className="size-5" />
          Codex
        </span>
        <span className="flex items-center gap-2.5">
          <OpenCodeIcon className="size-4" />
          OpenCode
        </span>
      </div>
    </section>
  )
}
