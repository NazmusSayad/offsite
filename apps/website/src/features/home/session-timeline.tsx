'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const pastGaps = [
  { start: 4.5, end: 6.5, label: 'closed' },
  { start: 10, end: 18, label: 'closed overnight' },
]

const shells = [
  { command: 'zsh', start: 0, color: 'var(--c2)' },
  { command: 'claude', start: 7, color: 'var(--c5)' },
  { command: 'npm run dev', start: 18.4, color: 'var(--c4)' },
]

function position(hours: number, axis: number) {
  return `${(hours / axis) * 100}%`
}

function formatUptime(hours: number) {
  const seconds = Math.floor(hours * 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${Math.floor(seconds / 3600)}:${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function formatDuration(hours: number) {
  const minutes = Math.floor(hours * 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`
}

export function SessionTimeline(props: { className?: string }) {
  const nowState = useState(20)
  const closedAtState = useState<number | null>(null)
  const gapsState = useState(pastGaps)
  const now = nowState[0]
  const setNow = nowState[1]
  const closedAt = closedAtState[0]

  useEffect(() => {
    const interval = setInterval(() => {
      setNow((value) => {
        if (closedAt === null) return value + 0.03
        return value + 0.12
      })
    }, 100)
    return () => clearInterval(interval)
  }, [closedAt, setNow])

  const closedRanges = [...gapsState[0]]
  if (closedAt !== null) {
    closedRanges.push({ start: closedAt, end: now, label: 'closed' })
  }
  const openRanges = []
  let openStart = 0
  for (const range of closedRanges) {
    openRanges.push({ start: openStart, end: range.start })
    openStart = range.end
  }
  if (closedAt === null) openRanges.push({ start: openStart, end: now })
  const axis = now / 0.92

  function handleToggleTab() {
    if (closedAt === null) {
      closedAtState[1](now)
      return
    }
    gapsState[1]([
      ...gapsState[0],
      { start: closedAt, end: now, label: 'closed' },
    ])
    closedAtState[1](null)
  }

  return (
    <div className={props.className}>
      <div className="grid grid-cols-[6.5rem_1fr] gap-x-4 font-mono text-sm sm:grid-cols-[9rem_1fr] sm:gap-x-6">
        <div className="pt-7">
          <p>browser tab</p>
          <p className="text-muted-foreground mt-0.5">
            {closedAt === null ? 'open' : 'closed'}
          </p>
        </div>
        <div className="relative h-20">
          {openRanges.map((range) => (
            <span
              key={range.start}
              className="bg-foreground absolute top-12 h-2 min-w-2 -translate-y-1/2 rounded-full"
              style={{
                left: position(range.start, axis),
                width: `calc(${position(range.end, axis)} - ${position(range.start, axis)})`,
              }}
            />
          ))}
          {closedRanges.map((range) => (
            <span
              key={range.start}
              className="text-muted-foreground @container absolute top-12 border-t-2 border-dashed border-current"
              style={{
                left: position(range.start, axis),
                width: `calc(${position(range.end, axis)} - ${position(range.start, axis)})`,
              }}
            >
              <span
                className={cn(
                  'absolute bottom-3 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap',
                  range.label === 'closed' && '@max-[3.5rem]:hidden',
                  range.label === 'closed overnight' && '@max-[8rem]:hidden'
                )}
              >
                {range.label}
              </span>
            </span>
          ))}
          <span
            className="text-primary absolute inset-y-0 z-10 border-l border-current"
            style={{ left: position(now, axis) }}
          >
            <span className="absolute top-0 left-2 text-xs">now</span>
          </span>
        </div>

        {shells.map((shell) => (
          <div key={shell.command} className="contents">
            <div className="py-3">
              <p className="truncate">{shell.command}</p>
              <p className="text-muted-foreground mt-0.5 tabular-nums">
                {formatUptime(now - shell.start)}
              </p>
            </div>
            <div className="relative min-h-16">
              <span
                className="border-primary absolute inset-y-0 border-l"
                style={{ left: position(now, axis) }}
              />
              <span
                className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
                style={{
                  left: position(shell.start, axis),
                  width: `calc(${position(now, axis)} - ${position(shell.start, axis)})`,
                  backgroundColor: shell.color,
                  boxShadow: `0 0 12px ${shell.color}`,
                }}
              />
              <span
                className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: position(shell.start, axis),
                  backgroundColor: shell.color,
                }}
              />
              <span
                className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: position(now, axis),
                  backgroundColor: shell.color,
                }}
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

      <p className="text-muted-foreground mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs">
        <span className="flex items-center gap-2">
          <span className="bg-foreground h-1.5 w-5 rounded-full" />
          tab open
        </span>
        <span className="flex items-center gap-2">
          <span className="w-5 border-t-2 border-dashed border-current" />
          tab closed
        </span>
        <span>
          time runs {closedAt === null && '1,080×'}
          {closedAt !== null && '4,320×'} faster here
        </span>
      </p>

      <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button
          variant="outline"
          onClick={handleToggleTab}
          className="h-10 rounded-xl px-4 text-sm"
        >
          {closedAt === null ? 'Close the tab' : 'Reopen the tab'}
        </Button>
        <p
          className={cn(
            'text-muted-foreground text-sm',
            closedAt !== null && 'text-foreground'
          )}
        >
          {closedAt === null &&
            'Close it and watch the clock. The shells keep counting.'}
          {closedAt !== null &&
            `Closed for ${formatDuration(now - closedAt)}. All three shells are still running.`}
        </p>
      </div>
    </div>
  )
}
