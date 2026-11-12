'use client'

import {
  ComputerTerminal01Icon,
  GlobalIcon,
  SmartPhone01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { clsx } from 'clsx'
import Image from 'next/image'
import { type ReactNode, useState } from 'react'
import { BrowserFrame, TerminalFrame } from './window-frame'

const steps = [
  {
    icon: ComputerTerminal01Icon,
    title: 'Start where you always do',
    text: 'Run claude, codex or opencode and give it something to work on. Nothing about your setup changes.',
  },
  {
    icon: GlobalIcon,
    title: 'Open a tab. It is already there',
    text: 'OffSite reads the session straight from the provider, so every message is in the browser the moment it exists.',
  },
  {
    icon: SmartPhone01Icon,
    title: 'Leave the desk',
    text: 'Answer a question, approve a plan or queue the next step from the couch. A push tells you when the agent needs you.',
  },
  {
    icon: ComputerTerminal01Icon,
    title: 'Pick it back up in the CLI',
    text: 'Resume the thread in the terminal. What you did from the browser is part of its history, because it was the same session all along.',
  },
]

export function Steps() {
  const [active, setActive] = useState(0)

  return (
    <section className="px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-5 md:grid-cols-[3fr_2fr] md:items-end md:gap-16">
          <h2 className="reveal max-w-xl text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-balance md:text-[3.5rem]">
            Not a copy. The same session, on every screen.
          </h2>
          <p className="reveal text-muted leading-relaxed [--delay:100ms]">
            Other tools keep their own chat history and hand you a second place
            to look. OffSite keeps none. It reads each provider&apos;s sessions
            from the provider, so there is one thread, and you pick the screen.
          </p>
        </div>

        <div className="reveal mt-12 grid gap-10 md:mt-16 md:grid-cols-[7fr_5fr] md:items-center md:gap-14 [--delay:160ms]">
          <div className="mesh-dusk grain relative aspect-[5/4] overflow-hidden rounded-[1.75rem]">
            <Visual show={active === 0} className="place-items-center px-8">
              <TerminalFrame className="w-full max-w-sm">
                <p>
                  <span className="text-[#f5b544]">$</span> claude
                </p>
                <p className="text-[#9aa0a8]">
                  <span className="text-[#666c75]">&gt;</span> Add a download
                  button to the file preview
                </p>
                <p className="text-[#666c75]">Working…</p>
              </TerminalFrame>
            </Visual>
            <Visual show={active === 1} className="items-center pl-8 sm:pl-12">
              <BrowserFrame className="w-[115%] max-w-none">
                <Image
                  src="/app-coding.webp"
                  width={2880}
                  height={1800}
                  sizes="(min-width: 768px) 760px, 115vw"
                  alt="A thread open in the browser"
                  className="aspect-[16/10] w-full object-cover object-left-top"
                />
              </BrowserFrame>
            </Visual>
            <Visual show={active === 2} className="justify-items-center pt-10">
              <Image
                src="/app-mobile.webp"
                width={1179}
                height={1977}
                sizes="280px"
                alt="The same thread on a phone"
                className="phone w-[42%] max-w-64"
              />
            </Visual>
            <Visual show={active === 3} className="place-items-center px-8">
              <TerminalFrame className="w-full max-w-sm">
                <p>
                  <span className="text-[#f5b544]">$</span> claude --resume
                </p>
                <p className="text-[#9aa0a8]">
                  <span className="text-[#666c75]">&gt;</span> Now add a test
                  for it
                </p>
              </TerminalFrame>
            </Visual>
          </div>

          <ol className="group">
            {steps.map((step, index) => (
              <li key={step.title} className="border-line border-b">
                <div className="relative h-px">
                  {index === active && (
                    <span
                      key={active}
                      onAnimationEnd={() =>
                        setActive((active + 1) % steps.length)
                      }
                      className="step-progress bg-foreground/70 absolute inset-0 origin-left group-hover:[animation-play-state:paused]"
                    />
                  )}
                </div>
                <button
                  type="button"
                  aria-expanded={index === active}
                  onClick={() => setActive(index)}
                  className={clsx(
                    'flex w-full cursor-pointer items-center gap-3 py-5 text-left text-lg font-medium tracking-tight transition-colors',
                    index !== active && 'text-subtle hover:text-foreground'
                  )}
                >
                  <HugeiconsIcon
                    icon={step.icon}
                    className={clsx(
                      'size-5 shrink-0',
                      index === active && 'text-accent'
                    )}
                  />
                  {step.title}
                </button>
                {index === active && (
                  <p className="text-muted -mt-2 pb-6 pl-8 leading-relaxed">
                    {step.text}
                  </p>
                )}
              </li>
            ))}
          </ol>
        </div>
        <p className="text-subtle mt-8 text-sm">
          Switch as often as you like, just not both at once. Keep a session
          open in one place at a time.
        </p>
      </div>
    </section>
  )
}

function Visual(props: {
  show: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      aria-hidden={!props.show}
      className={clsx(
        'absolute inset-0 grid transition duration-500 ease-out motion-reduce:transition-none',
        !props.show && 'pointer-events-none translate-y-3 opacity-0',
        props.className
      )}
    >
      {props.children}
    </div>
  )
}
