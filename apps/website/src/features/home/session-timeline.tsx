'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const gaps = [
  { start: 18, end: 26, label: 'closed' },
  { start: 52, end: 84, label: 'closed overnight' },
]

const shells = [
  { command: 'zsh', start: 0, startedAgo: 90187, color: 'var(--c2)' },
  { command: 'claude', start: 30, startedAgo: 72745, color: 'var(--c5)' },
  { command: 'npm run dev', start: 88, startedAgo: 3132, color: 'var(--c4)' },
]

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

export function SessionTimeline(props: { className?: string }) {
  const [tabOpen, setTabOpen] = useState(true)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div
      className={cn(
        'bg-card/50 rounded-2xl border p-5 sm:p-8',
        props.className
      )}
    >
      <div className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-6 font-mono text-sm sm:grid-cols-[8rem_1fr] sm:gap-x-6">
        <div>
          <p>browser</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {tabOpen ? 'open' : 'closed'}
          </p>
        </div>
        <div className="relative h-10">
          <span className="bg-foreground/80 absolute top-1/2 left-0 h-2 w-[18%] -translate-y-1/2 rounded-full" />
          <span className="bg-foreground/80 absolute top-1/2 left-[26%] h-2 w-[26%] -translate-y-1/2 rounded-full" />
          {gaps.map((gap) => (
            <span
              key={gap.label}
              className="text-muted-foreground/60 absolute top-1/2 border-t border-dashed border-current text-[11px]"
              style={{
                left: `${gap.start}%`,
                width: `${gap.end - gap.start}%`,
              }}
            >
              <span className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap max-lg:hidden">
                {gap.label}
              </span>
            </span>
          ))}
          <span
            className={cn(
              'bg-foreground/80 absolute top-1/2 left-[84%] h-2 -translate-y-1/2 rounded-full transition-[width] duration-500',
              tabOpen && 'w-[16%]',
              !tabOpen && 'w-[8%]'
            )}
          />
          <span
            className={cn(
              'absolute top-1/2 left-[92%] w-[8%] border-t border-dashed transition-opacity duration-500',
              tabOpen && 'opacity-0'
            )}
          />
        </div>

        {shells.map((shell) => (
          <div key={shell.command} className="contents">
            <div>
              <p className="truncate">{shell.command}</p>
              <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                {formatUptime(shell.startedAgo + elapsed)}
              </p>
            </div>
            <div className="relative h-10">
              <span
                className="absolute top-1/2 right-0 h-0.5 -translate-y-1/2 rounded-full"
                style={{
                  left: `${shell.start}%`,
                  backgroundColor: shell.color,
                  boxShadow: `0 0 12px ${shell.color}`,
                }}
              />
              <span
                className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${shell.start}%`,
                  backgroundColor: shell.color,
                }}
              />
              <span
                className="absolute top-1/2 right-0 size-2.5 translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: shell.color }}
              >
                <span
                  className="absolute inset-0 animate-ping rounded-full motion-reduce:hidden"
                  style={{ backgroundColor: shell.color }}
                />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t pt-6">
        <Button
          variant="outline"
          onClick={() => setTabOpen(!tabOpen)}
          className="h-10 rounded-xl px-4 text-sm"
        >
          {tabOpen ? 'Close the tab' : 'Reopen the tab'}
        </Button>
        <p className="text-muted-foreground text-sm">
          {tabOpen
            ? 'The browser only shows your shells. They run in sshtty.'
            : 'The tab is closed. Your shells are still running.'}
        </p>
      </div>
    </div>
  )
}
