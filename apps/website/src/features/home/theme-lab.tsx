'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import themes from '../../../../server/src/themes.json'

const fonts = [
  { name: 'JetBrains Mono', family: 'JetBrainsMono Nerd Font' },
  { name: 'Fira Code', family: 'FiraCode Nerd Font' },
  { name: 'Cascadia Code', family: 'CaskaydiaCove Nerd Font' },
  { name: 'Hack', family: 'Hack Nerd Font' },
]

function applyTheme(theme: (typeof themes)[number]) {
  const style = document.documentElement.style
  style.setProperty('--bg', theme.colors.background)
  style.setProperty('--text', theme.colors.foreground)
  for (let index = 1; index <= 6; index++) {
    style.setProperty(`--c${index}`, theme.colors.palette[index])
  }
}

export function ThemeLab() {
  const [activeId, setActiveId] = useState(themes[0].id)

  return (
    <section className="mx-auto max-w-7xl px-6 pb-32">
      <div className="grid gap-6 md:grid-cols-12 md:items-end">
        <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl md:col-span-7">
          {themes.length} themes. Try one on this page.
        </h2>
        <p className="text-muted-foreground text-lg md:col-span-5">
          Every theme below ships with sshtty, along with custom colors and
          bundled Nerd Fonts with ligatures. Pick one and watch this site
          change.
        </p>
      </div>

      <div className="mt-16 grid gap-12 lg:grid-cols-12">
        <div className="grid min-w-0 grid-cols-2 gap-3 lg:col-span-7">
          {themes.map((theme) => (
            <button
              key={theme.id}
              type="button"
              aria-pressed={theme.id === activeId}
              onClick={() => {
                setActiveId(theme.id)
                applyTheme(theme)
              }}
              style={{
                backgroundColor: theme.colors.background,
                color: theme.colors.foreground,
                outlineColor: theme.colors.palette[4],
              }}
              className={cn(
                'flex flex-col gap-3 rounded-xl border p-4 text-left transition-transform duration-200 hover:-translate-y-0.5',
                theme.id === activeId && 'outline-2 outline-offset-2'
              )}
            >
              <span className="truncate font-mono text-xs sm:text-sm">
                {theme.name}
              </span>
              <span className="flex h-3 overflow-hidden rounded-sm">
                {theme.colors.palette.map((color, index) => (
                  <span
                    key={index}
                    className="flex-1"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
            </button>
          ))}
        </div>

        <ul className="flex min-w-0 flex-col justify-between gap-8 lg:col-span-5">
          {fonts.map((font) => (
            <li key={font.name} className="border-b pb-6">
              <p className="text-muted-foreground text-sm">{font.name}</p>
              <p
                className="text-foreground mt-2 truncate text-lg sm:text-3xl"
                style={{ fontFamily: `'${font.family}', monospace` }}
              >
                tab <span className="text-ansi-blue">=&gt;</span> tab.
                <span className="text-ansi-cyan">alive</span>{' '}
                <span className="text-ansi-red">!==</span>{' '}
                <span className="text-ansi-yellow">false</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
