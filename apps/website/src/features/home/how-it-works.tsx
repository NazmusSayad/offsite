'use client'

import { AppWindowIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Logo } from './logo'

const shells = [
  { command: 'zsh', startedAgo: 7834 },
  { command: 'claude', startedAgo: 2491 },
  { command: 'npm run dev', startedAgo: 613 },
]

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function HowItWorks() {
  const [tabOpen, setTabOpen] = useState(true)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <section className="corner-marks grid border-t lg:grid-cols-2 lg:divide-x">
      <div className="px-6 py-20 sm:px-12 sm:py-28">
        <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Closing the tab doesn&apos;t close the shell.
        </h2>
        <p className="text-muted-foreground mt-6 max-w-lg text-lg">
          Your shells run inside sshtty, on your machine. The browser only shows
          them. Close it, reopen it later, and every terminal is where you left
          it. Press Ctrl+C in sshtty to end them all.
        </p>
        <Button
          variant="outline"
          onClick={() => setTabOpen(!tabOpen)}
          className="mt-8 h-11 rounded-xl px-5 text-base"
        >
          {tabOpen ? 'Close the tab' : 'Reopen the tab'}
        </Button>
      </div>

      <div className="flex flex-col items-center justify-center border-t px-6 py-20 sm:px-12 lg:border-t-0">
        <div
          className={cn(
            'flex w-full max-w-sm items-center gap-3 rounded-xl border bg-card px-4 py-3 transition-opacity duration-300',
            !tabOpen && 'opacity-40'
          )}
        >
          <AppWindowIcon className="text-muted-foreground size-5" />
          <span className="font-mono text-sm">127.0.0.1:47831</span>
          <span className="text-muted-foreground ml-auto text-sm">
            {tabOpen ? 'Open' : 'Closed'}
          </span>
        </div>

        <div
          className={cn(
            'h-16 w-0.5',
            tabOpen
              ? 'animate-flow bg-[linear-gradient(var(--c4)_50%,transparent_50%)] bg-size-[2px_12px] motion-reduce:animate-none'
              : 'bg-[linear-gradient(var(--border)_50%,transparent_50%)] bg-size-[2px_12px]'
          )}
        />

        <div className="bg-card w-full rounded-2xl border p-2">
          <div className="flex items-center gap-2.5 px-3 pt-2 pb-3">
            <Logo className="text-primary size-5" />
            <span className="font-mono text-sm">sshtty</span>
            <span className="text-muted-foreground text-sm">
              on your machine
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {shells.map((shell) => (
              <li
                key={shell.command}
                className="bg-background/60 flex items-center gap-3 rounded-lg px-3 py-2.5 font-mono text-sm"
              >
                <span className="bg-ansi-green size-2 rounded-full shadow-[0_0_8px_var(--c2)]" />
                {shell.command}
                <span className="text-muted-foreground ml-auto tabular-nums">
                  {formatUptime(shell.startedAgo + elapsed)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
