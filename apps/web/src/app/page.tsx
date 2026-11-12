import {
  ComputerTerminal01Icon,
  HelpCircleIcon,
  SmartPhone01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ReactNode } from 'react'
import {
  Closing,
  Principles,
  Questions,
  SiteFooter,
} from '@/components/closing'
import { Desk } from '@/components/desk'
import { Hero, SiteHeader } from '@/components/hero'
import { Mobile } from '@/components/mobile'
import { Reveal } from '@/components/reveal'
import { Steps } from '@/components/steps'

const themes = [
  [
    'One Dark Darker',
    '#15181C',
    '#ABB2BF',
    '#EE5D69',
    '#97C775',
    '#61AFEF',
    '#C678DD',
  ],
  [
    'One Dark Pro',
    '#282C34',
    '#ABB2BF',
    '#E05561',
    '#8CC265',
    '#4AA5F0',
    '#C162DE',
  ],
  ['Dracula', '#282A36', '#F8F8F2', '#FF5555', '#50FA7B', '#BD93F9', '#FF79C6'],
  [
    'Tokyo Night',
    '#1A1B26',
    '#C0CAF5',
    '#F7768E',
    '#9ECE6A',
    '#7AA2F7',
    '#BB9AF7',
  ],
  [
    'Catppuccin Mocha',
    '#1E1E2E',
    '#CDD6F4',
    '#F38BA8',
    '#A6E3A1',
    '#89B4FA',
    '#F5C2E7',
  ],
  ['Nord', '#2E3440', '#D8DEE9', '#BF616A', '#A3BE8C', '#81A1C1', '#B48EAD'],
  [
    'Gruvbox Dark',
    '#282828',
    '#EBDBB2',
    '#CC241D',
    '#98971A',
    '#458588',
    '#B16286',
  ],
  [
    'Solarized Dark',
    '#002B36',
    '#839496',
    '#DC322F',
    '#859900',
    '#268BD2',
    '#D33682',
  ],
  [
    'GitHub Dark',
    '#0D1117',
    '#E6EDF3',
    '#FF7B72',
    '#3FB950',
    '#58A6FF',
    '#BC8CFF',
  ],
  [
    'Rosé Pine',
    '#191724',
    '#E0DEF4',
    '#EB6F92',
    '#31748F',
    '#9CCFD8',
    '#C4A7E7',
  ],
]

export default function Home() {
  return (
    <div className="bg-background text-foreground overflow-x-clip">
      <SiteHeader />
      <main>
        <Hero />

        <section className="px-6 py-28 md:py-40">
          <div className="reveal mx-auto max-w-[35rem] text-[1.4rem] leading-[1.5] font-medium tracking-[-0.02em] md:text-[1.7rem]">
            <p>
              Your agent works in a{' '}
              <span className="whitespace-nowrap">
                terminal.
                <Mark>
                  <HugeiconsIcon icon={ComputerTerminal01Icon} />
                </Mark>
              </span>
            </p>
            <p>The terminal stays on your desk.</p>
            <p>
              So you stay there too, in case it{' '}
              <span className="whitespace-nowrap">
                asks.
                <Mark>
                  <HugeiconsIcon icon={HelpCircleIcon} />
                </Mark>
              </span>
            </p>
            <p className="text-subtle mt-6">
              Or you walk away, and it waits for you.
            </p>
            <p className="text-subtle mt-6">
              OffSite puts the same session in your{' '}
              <span className="whitespace-nowrap">
                pocket.
                <Mark>
                  <HugeiconsIcon icon={SmartPhone01Icon} />
                </Mark>
              </span>
            </p>
          </div>
        </section>

        <Steps />
        <Desk />
        <Mobile />

        <section className="px-6 py-24 md:py-32">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-6 md:grid-cols-2 md:items-end md:gap-16">
              <h2 className="reveal text-4xl leading-[1.05] font-medium tracking-[-0.035em] text-balance md:text-[3.5rem]">
                Your colors, your font.
              </h2>
              <p className="reveal text-muted text-lg leading-relaxed [--delay:100ms]">
                Ten themes for the app and the terminal, with Fira Code,
                ligatures and Nerd Font icons built in, or any font you have
                installed.
              </p>
            </div>
            <ul className="reveal mt-14 grid grid-cols-2 gap-3 [--delay:160ms] sm:grid-cols-3 md:mt-16 lg:grid-cols-5">
              {themes.map((theme) => (
                <li
                  key={theme[0]}
                  style={{ background: theme[1], color: theme[2] }}
                  className="rounded-2xl p-4 font-mono text-sm ring-1 ring-black/10 ring-inset dark:ring-white/10"
                >
                  <p className="flex items-center justify-between">
                    <span>Aa</span>
                    <span className="flex gap-1.5">
                      {theme.slice(3).map((color) => (
                        <span
                          key={color}
                          style={{ background: color }}
                          className="size-2.5 rounded-full"
                        />
                      ))}
                    </span>
                  </p>
                  <p className="mt-6 text-xs opacity-70">{theme[0]}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Principles />
        <Questions />
        <Closing />
      </main>
      <SiteFooter />
      <Reveal />
    </div>
  )
}

function Mark(props: { children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="bg-surface ring-line text-accent ml-[0.3em] inline-grid size-[1.1em] translate-y-[-0.08em] place-items-center rounded-[0.3em] align-middle shadow-[0_6px_16px_-8px_rgb(0_0_0/30%)] ring-1 [&_svg]:size-[0.62em]"
    >
      {props.children}
    </span>
  )
}
