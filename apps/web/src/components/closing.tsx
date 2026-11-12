import { PlusSignIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import Link from 'next/link'
import { GITHUB_URL, NPM_URL } from '@/lib/layout'
import { CopyCommand } from './copy-command'

const principles = [
  {
    title: 'Runs on your machine',
    text: 'OffSite is a server on your computer, next to your code and your CLIs. There is no account to make.',
  },
  {
    title: 'No history of its own',
    text: 'Sessions belong to the provider. OffSite reads them from Claude Code, Codex and OpenCode, and keeps no copy.',
  },
  {
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
    <section className="px-6 py-16 md:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="reveal max-w-xl text-4xl font-semibold tracking-[-0.035em] text-balance md:text-5xl">
          Your machine, your sessions
        </h2>
        <div className="border-line mt-14 grid gap-10 border-t pt-10 md:grid-cols-3 md:gap-12">
          {principles.map((principle) => (
            <div key={principle.title} className="reveal">
              <h3 className="text-lg font-semibold tracking-tight">
                {principle.title}
              </h3>
              <p className="text-muted mt-2 leading-relaxed">
                {principle.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Questions() {
  return (
    <section className="px-6 py-16 md:py-24">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[2fr_3fr] md:gap-20">
        <div>
          <h2 className="reveal text-4xl font-semibold tracking-[-0.035em] text-balance md:text-5xl">
            Questions
          </h2>
          <p className="reveal text-muted mt-5 leading-relaxed">
            More in the{' '}
            <Link href="/docs" className="text-foreground underline">
              docs
            </Link>
            .
          </p>
        </div>
        <div className="reveal divide-line border-line divide-y border-y">
          {questions.map((item) => (
            <details key={item.question} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden">
                {item.question}
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  className="text-subtle size-4 shrink-0 transition-transform group-open:rotate-45"
                />
              </summary>
              <p className="text-muted [&_code]:text-foreground pb-5 leading-relaxed [&_code]:font-mono [&_code]:text-[0.9em]">
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
    <section className="px-6 py-16 md:py-24">
      <div className="reveal mx-auto max-w-2xl text-center">
        <h2 className="text-4xl font-semibold tracking-[-0.035em] text-balance md:text-5xl">
          Try it now
        </h2>
        <p className="text-muted mt-5 text-lg leading-relaxed">
          One command, on the machine where your code lives.
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
    </section>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-line border-t px-6">
      <div className="text-muted mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 py-10 text-sm">
        <p className="text-foreground flex items-center gap-2.5 font-semibold tracking-tight">
          <img src="/icon.svg" alt="" className="size-5" />
          OffSite
        </p>
        <nav className="flex gap-7">
          <Link
            href="/docs"
            className="hover:text-foreground transition-colors"
          >
            Docs
          </Link>
          <a
            href={GITHUB_URL}
            className="hover:text-foreground transition-colors"
          >
            GitHub
          </a>
          <a href={NPM_URL} className="hover:text-foreground transition-colors">
            npm
          </a>
        </nav>
        <p className="text-subtle">© 2026 Nazmus Sayad · MIT license</p>
      </div>
    </footer>
  )
}
