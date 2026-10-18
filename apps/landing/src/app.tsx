import {
  ArrowLeftRightIcon,
  ArrowTurnBackwardIcon,
  ChatGptIcon,
  CheckIcon,
  ComputerTerminal01Icon,
  CopyIcon,
  Download01Icon,
  Folder01Icon,
  GitPullRequestIcon,
  GithubIcon,
  LockKeyIcon,
  Notification01Icon,
  ServerStack01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { clsx } from 'clsx'
import { type ReactNode, useState } from 'react'
import { ClaudeIcon, OpenCodeIcon } from './icons'

const GITHUB_URL = 'https://github.com/NazmusSayad/offsite'

export function App() {
  return (
    <div className="overflow-x-clip">
      <header className="border-line bg-background/70 sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <a
            href="/"
            className="flex items-center gap-2.5 font-semibold tracking-tight"
          >
            <img src="/icon.svg" alt="" className="size-6" />
            OffSite
          </a>
          <a
            href={GITHUB_URL}
            className="text-muted hover:text-foreground flex items-center gap-2 text-sm transition-colors"
          >
            <HugeiconsIcon icon={GithubIcon} className="size-4" />
            GitHub
          </a>
        </div>
      </header>

      <main className="border-line mx-auto max-w-6xl border-x">
        <Hero />
        <Providers />
        <SharedSessions />
        <Workspace />
        <Anywhere />
        <GetStarted />
      </main>

      <footer className="border-line border-t">
        <div className="text-subtle mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm">
          <span className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="size-5" />
            MIT License · Nazmus Sayad
          </span>
          <a
            href={GITHUB_URL}
            className="hover:text-foreground transition-colors"
          >
            github.com/NazmusSayad/offsite
          </a>
        </div>
      </footer>
    </div>
  )
}

function Hero() {
  return (
    <section className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-14 h-[44rem] bg-[radial-gradient(ellipse_55%_50%_at_50%_0%,rgb(255_255_255/11%),transparent)]"
      />
      <div className="relative px-6 pt-20 pb-14 md:px-12 md:pt-28">
        <h1 className="fade-up max-w-4xl text-[2.75rem] leading-[1.02] font-semibold tracking-[-0.045em] text-balance md:text-7xl">
          Claude Code, Codex and OpenCode.{' '}
          <span className="text-muted">In your browser.</span>
        </h1>
        <p className="fade-up text-muted mt-6 max-w-xl text-lg leading-relaxed [animation-delay:80ms]">
          OffSite runs on your machine and opens the same sessions as the CLIs.
          Start a task in the terminal, carry on in a browser tab, and switch
          back whenever you like.
        </p>
        <div className="fade-up mt-10 flex flex-wrap items-center gap-3 [animation-delay:160ms]">
          <CopyCommand />
          <a
            href={GITHUB_URL}
            className="border-line hover:bg-surface flex h-11 items-center gap-2 rounded-full border px-5 text-sm font-medium transition-colors"
          >
            <HugeiconsIcon icon={GithubIcon} className="size-4" />
            View on GitHub
          </a>
        </div>
      </div>
      <div className="fade-up relative px-3 pb-16 [animation-delay:240ms] md:px-12 md:pb-24">
        <div className="border-line bg-surface rounded-2xl border p-1.5 shadow-[0_40px_160px_-40px_rgb(255_255_255/18%)] md:p-2">
          <img
            src="/app-coding.webp"
            width={2880}
            height={1800}
            alt="OffSite with a Claude Code thread open next to the thread list"
            className="aspect-[4/3] rounded-xl object-cover object-left-top md:aspect-auto"
          />
        </div>
      </div>
    </section>
  )
}

function Providers() {
  return (
    <section className="border-line divide-line grid divide-y border-t md:grid-cols-3 md:divide-x md:divide-y-0">
      <Provider name="Claude Code" command="claude">
        <ClaudeIcon className="size-6" />
      </Provider>
      <Provider name="Codex" command="codex">
        <HugeiconsIcon icon={ChatGptIcon} className="size-6" />
      </Provider>
      <Provider name="OpenCode" command="opencode">
        <OpenCodeIcon className="h-6" />
      </Provider>
    </section>
  )
}

function Provider(props: {
  name: string
  command: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-7 md:px-8">
      <span className="border-line bg-surface grid size-11 shrink-0 place-items-center rounded-xl border">
        {props.children}
      </span>
      <div>
        <p className="font-medium">{props.name}</p>
        <p className="text-subtle text-sm">
          Same sessions as{' '}
          <code className="text-muted font-mono">{props.command}</code>
        </p>
      </div>
    </div>
  )
}

function SharedSessions() {
  return (
    <section className="border-line border-t px-6 py-20 md:px-12 md:py-28">
      <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] md:text-5xl">
        One history, two ways in.
      </h2>
      <p className="text-muted mt-5 max-w-2xl text-lg leading-relaxed">
        OffSite doesn&apos;t keep its own copy of your conversations. It reads
        each provider&apos;s sessions directly, so a thread you start in the
        terminal is already in the browser, and one you start in the browser
        resumes in the CLI.
      </p>

      <div className="mt-14 flex flex-col items-stretch md:flex-row md:items-center">
        <div className="border-line bg-surface rounded-xl border p-5 md:w-64">
          <p className="text-subtle text-xs font-medium tracking-wide uppercase">
            Terminal
          </p>
          <p className="mt-3 font-mono text-sm">
            <span className="text-subtle">$</span> claude
          </p>
        </div>
        <Connector />
        <div className="relative flex-1 rounded-xl border border-white/25 bg-white/[0.04] p-5 shadow-[0_0_60px_-12px_rgb(255_255_255/18%)]">
          <p className="text-subtle text-xs font-medium tracking-wide uppercase">
            Session history
          </p>
          <p className="mt-3 text-sm">Kept by Claude Code, Codex or OpenCode</p>
        </div>
        <Connector />
        <div className="border-line bg-surface rounded-xl border p-5 md:w-64">
          <p className="text-subtle text-xs font-medium tracking-wide uppercase">
            Browser
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm">
            <img src="/icon.svg" alt="" className="size-4" />
            OffSite
          </p>
        </div>
      </div>
    </section>
  )
}

function Connector() {
  return (
    <div className="relative flex h-12 items-center justify-center md:h-auto md:w-20">
      <span className="bg-line absolute inset-y-0 left-1/2 w-px md:inset-x-0 md:inset-y-auto md:top-1/2 md:h-px md:w-auto" />
      <span className="bg-background text-muted relative grid size-7 place-items-center rounded-full">
        <HugeiconsIcon
          icon={ArrowLeftRightIcon}
          className="size-4 rotate-90 md:rotate-0"
        />
      </span>
    </div>
  )
}

function Workspace() {
  return (
    <section className="border-line grid border-t md:grid-cols-[5fr_7fr]">
      <div className="px-6 py-20 md:px-12 md:py-24">
        <h2 className="text-3xl font-semibold tracking-[-0.035em] md:text-5xl">
          The rest of your desk, too.
        </h2>
        <p className="text-muted mt-5 text-lg leading-relaxed">
          The chat sits next to the tools you&apos;d otherwise switch windows
          for.
        </p>
        <ul className="mt-10 space-y-6">
          <Feature
            icon={ComputerTerminal01Icon}
            title="Terminal"
            text="Run commands in a real terminal under the chat."
          />
          <Feature
            icon={GitPullRequestIcon}
            title="Git"
            text="Review diffs, commit, switch branches and open pull requests."
          />
          <Feature
            icon={Folder01Icon}
            title="Files"
            text="Browse the project and preview any file."
          />
          <Feature
            icon={ArrowTurnBackwardIcon}
            title="Rewind and fork"
            text="Edit an earlier message, restore code, or fork from any reply."
          />
        </ul>
      </div>
      <div className="border-line relative min-h-80 overflow-hidden border-t md:border-t-0 md:border-l">
        <img
          src="/app-terminal.webp"
          width={2880}
          height={1800}
          alt="OffSite with the terminal panel open under a thread"
          className="absolute top-12 left-10 h-[calc(100%-3rem)] w-[calc(100%-2.5rem)] rounded-tl-xl border-t border-l border-white/10 object-cover object-[47%_100%] md:top-16 md:left-14 md:h-[calc(100%-4rem)] md:w-[calc(100%-3.5rem)]"
        />
      </div>
    </section>
  )
}

function Feature(props: {
  icon: typeof GithubIcon
  title: string
  text: string
}) {
  return (
    <li className="flex gap-4">
      <HugeiconsIcon icon={props.icon} className="mt-0.5 size-5 shrink-0" />
      <p className="text-muted leading-relaxed">
        <span className="text-foreground font-medium">{props.title}.</span>{' '}
        {props.text}
      </p>
    </li>
  )
}

function Anywhere() {
  return (
    <section className="border-line border-t">
      <div className="px-6 pt-20 pb-14 md:px-12 md:pt-28">
        <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] md:text-5xl">
          Check in from anywhere.
        </h2>
        <p className="text-muted mt-5 max-w-xl text-lg leading-relaxed">
          The whole app fits a phone screen, so a long task doesn&apos;t keep
          you at your desk.
        </p>
      </div>
      <div className="border-line grid border-t md:grid-cols-3 md:grid-rows-2">
        <div className="border-line relative h-96 overflow-hidden border-b bg-[radial-gradient(ellipse_70%_60%_at_50%_100%,rgb(255_255_255/9%),transparent)] md:row-span-2 md:h-auto md:border-r md:border-b-0">
          <img
            src="/app-mobile.webp"
            width={1179}
            height={1977}
            alt="OffSite on a phone, showing a thread and the message box"
            className="absolute top-10 left-1/2 w-60 -translate-x-1/2 rounded-[2rem] border-4 border-[#1c1c1c] shadow-2xl"
          />
        </div>
        <Cell
          icon={Download01Icon}
          title="Install it as an app"
          text={
            <>
              Start with{' '}
              <code className="text-foreground font-mono">--pwa</code> and add
              OffSite to your home screen. It opens offline too.
            </>
          }
          className="md:border-r md:border-b"
        />
        <Cell
          icon={Notification01Icon}
          title="Notifications"
          text="Get a push when an agent or a terminal needs you, even with no OffSite tab open."
          className="border-t md:border-t-0 md:border-b"
        />
        <Cell
          icon={ServerStack01Icon}
          title="More than one machine"
          text="Pair your laptop and your desktop, and switch between them from the sidebar."
          className="border-t md:border-t-0 md:border-r"
        />
        <Cell
          icon={LockKeyIcon}
          title="Paired browsers only"
          text={
            <>
              Only browsers that opened a pairing link can connect. Remove one
              any time with{' '}
              <code className="text-foreground font-mono">offsite unpair</code>.
            </>
          }
          className="border-t md:border-t-0"
        />
      </div>
    </section>
  )
}

function Cell(props: {
  icon: typeof GithubIcon
  title: string
  text: ReactNode
  className: string
}) {
  return (
    <div
      className={clsx(
        'border-line px-6 py-10 md:px-10 md:py-12',
        props.className
      )}
    >
      <HugeiconsIcon icon={props.icon} className="size-5" />
      <h3 className="mt-5 font-medium">{props.title}</h3>
      <p className="text-muted mt-2 leading-relaxed">{props.text}</p>
    </div>
  )
}

function GetStarted() {
  return (
    <section className="border-line relative overflow-hidden border-t px-6 py-24 text-center md:py-32">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-full bg-[radial-gradient(ellipse_50%_70%_at_50%_100%,rgb(255_255_255/8%),transparent)]"
      />
      <h2 className="relative text-4xl font-semibold tracking-[-0.04em] md:text-6xl">
        Start with one command.
      </h2>
      <p className="text-muted relative mx-auto mt-5 max-w-md text-lg leading-relaxed">
        Run it, then open the pairing link it prints. Your agents are one tab
        away.
      </p>
      <div className="relative mt-10 flex justify-center">
        <CopyCommand />
      </div>
      <dl className="border-line bg-surface/60 relative mx-auto mt-16 grid max-w-2xl gap-x-8 gap-y-3 rounded-xl border p-6 text-left text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-mono">offsite</dt>
        <dd className="text-muted">Starts the server and the web app</dd>
        <dt className="font-mono">offsite serve</dt>
        <dd className="text-muted">Starts only the server</dd>
        <dt className="font-mono">offsite pair</dt>
        <dd className="text-muted">Makes a pairing link for another browser</dd>
        <dt className="font-mono">offsite unpair</dt>
        <dd className="text-muted">Picks a paired browser to remove</dd>
      </dl>
    </section>
  )
}

function CopyCommand() {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText('npx offsite')
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
      className="bg-foreground text-background flex h-11 cursor-pointer items-center gap-3 rounded-full pr-4 pl-5 font-mono text-sm font-medium transition hover:bg-white active:scale-[0.98]"
    >
      <span>
        <span className="text-background/45">$</span> npx offsite
      </span>
      <HugeiconsIcon
        icon={copied ? CheckIcon : CopyIcon}
        className="text-background/60 size-4"
      />
      <span className="sr-only">{copied ? 'Copied' : 'Copy command'}</span>
    </button>
  )
}
