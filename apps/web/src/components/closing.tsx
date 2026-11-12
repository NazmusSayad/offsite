import {
  DatabaseIcon,
  LaptopIcon,
  PlusSignIcon,
  SquareLock02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import Link from 'next/link'
import { GITHUB_URL, NPM_URL } from '@/lib/layout'
import { CopyCommand } from './copy-command'
import { TerminalFrame } from './window-frame'

const principles = [
  {
    icon: LaptopIcon,
    title: 'Runs on your machine',
    text: 'OffSite is a server on your computer, next to your code and your CLIs. There is no account to make.',
  },
  {
    icon: DatabaseIcon,
    title: 'No history of its own',
    text: 'Sessions belong to the provider. OffSite reads them from Claude Code, Codex and OpenCode, and keeps no copy.',
  },
  {
    icon: SquareLock02Icon,
    title: 'Paired browsers only',
    text: 'The browser that opens the pairing link is paired. Every other browser is refused.',
  },
]

const questions = [
  {
    question: 'Does OffSite keep a copy of my chats?',
    answer:
      'No. It reads each session from the provider. The only thing it stores is a message you sent from the browser, until the provider takes it.',
  },
  {
    question: 'Can I keep using the CLI?',
    answer:
      'Yes. OffSite opens the same sessions, so you can start in one and resume in the other. Keep a session open in one place at a time.',
  },
  {
    question: 'What do I need installed?',
    answer:
      'Node.js and the CLIs you want to use. OffSite needs Claude Code on your PATH to start.',
  },
  {
    question: 'How do I open it on my phone?',
    answer: (
      <>
        Start OffSite with <code>--host</code> set to an address your phone can
        reach, then run <code>offsite pair</code> with the same{' '}
        <code>--host</code> and open the link it prints.
      </>
    ),
  },
  {
    question: 'Can it start when I log in?',
    answer: (
      <>
        Yes. <code>offsite install</code> starts it at login with the options
        you pass, and <code>offsite uninstall</code> stops that.
      </>
    ),
  },
  {
    question: 'Can I run more than one?',
    answer: (
      <>
        Yes. Give each instance its own <code>--port</code> and{' '}
        <code>--dir</code>.
      </>
    ),
  },
]

export function Principles() {
  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal mx-auto max-w-xl text-center text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-balance md:text-[3.5rem]">
          Nothing leaves your desk.
        </h2>
        <ul className="reveal border-line divide-line mt-14 grid divide-y border-y [--delay:120ms] md:mt-20 md:grid-cols-3 md:divide-x md:divide-y-0">
          {principles.map((principle) => (
            <li key={principle.title} className="py-8 md:px-8 md:py-10">
              <HugeiconsIcon
                icon={principle.icon}
                className="text-accent size-6"
              />
              <h3 className="mt-6 text-lg font-medium">{principle.title}</h3>
              <p className="text-muted mt-2 leading-relaxed">
                {principle.text}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export function Questions() {
  return (
    <section className="px-6 pb-24 md:pb-32">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[2fr_3fr] md:gap-16">
        <div>
          <h2 className="reveal text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-balance md:text-5xl">
            Questions, answered.
          </h2>
          <p className="reveal text-muted mt-5 leading-relaxed [--delay:100ms]">
            More in the{' '}
            <Link href="/docs" className="text-foreground underline">
              docs
            </Link>
            .
          </p>
        </div>
        <div className="reveal flex flex-col gap-2.5 [--delay:120ms]">
          {questions.map((item) => (
            <details
              key={item.question}
              className="group bg-surface ring-line rounded-2xl ring-1"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
                {item.question}
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  className="text-subtle size-4 shrink-0 transition-transform group-open:rotate-45"
                />
              </summary>
              <p className="text-muted [&_code]:text-foreground px-5 pb-5 leading-relaxed [&_code]:font-mono [&_code]:text-[0.9em]">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Closing() {
  return (
    <section className="px-6 pb-16">
      <div className="mesh-sunrise grain mx-auto grid max-w-6xl items-center gap-12 overflow-hidden rounded-[2rem] px-6 py-14 sm:px-12 md:grid-cols-2 md:py-20">
        <div>
          <h2 className="text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-balance md:text-[3.5rem]">
            One command away.
          </h2>
          <p className="text-foreground/70 mt-5 max-w-md text-lg leading-relaxed">
            It runs on your machine and prints a link. The browser that opens it
            is paired.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <CopyCommand />
            <Link
              href="/docs"
              className="hover:bg-foreground/5 border-foreground/15 flex h-11 items-center rounded-full border px-5 text-sm font-medium transition-colors"
            >
              Read the docs
            </Link>
          </div>
        </div>
        <TerminalFrame className="w-full">
          <p>
            <span className="text-[#f5b544]">$</span> npx offsite
          </p>
          <p className="break-all text-[#9aa0a8]">
            offsite is running at{' '}
            <span className="text-[#f1f2f4]">
              http://127.0.0.1:47841/pair#…
            </span>
          </p>
        </TerminalFrame>
      </div>
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="overflow-hidden px-6 pt-10">
      <div className="text-subtle mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 text-sm">
        <span className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="" className="size-5" />
          MIT License · Nazmus Sayad
        </span>
        <nav className="flex items-center gap-6">
          <Link
            href="/docs"
            className="hover:text-foreground transition-colors"
          >
            Docs
          </Link>
          <a href={NPM_URL} className="hover:text-foreground transition-colors">
            npm
          </a>
          <a
            href={GITHUB_URL}
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </nav>
      </div>
      <p
        aria-hidden="true"
        className="text-foreground/[0.06] mx-auto -mb-[0.22em] max-w-6xl pt-6 text-center text-[24vw] leading-none font-semibold tracking-[-0.06em] select-none lg:text-[17rem]"
      >
        OffSite
      </p>
    </footer>
  )
}
