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
  const activeIdState = useState(themes[0].id)
  const activeId = activeIdState[0]

  return (
    <section className="mx-2 rounded-3xl border bg-(--bg) py-24 transition-colors duration-700 sm:mx-3 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="font-mono text-3xl font-semibold tracking-tighter text-balance sm:text-5xl">
              {themes.length} themes built in. Try one.
            </h2>
            <p className="text-muted-foreground mt-6 max-w-md text-lg">
              Pick a theme and this page switches to it. sshtty also takes
              custom colors.
            </p>
            <ul className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8">
              {fonts.map((font) => (
                <li key={font.name}>
                  <p
                    className="text-foreground text-2xl whitespace-nowrap sm:text-3xl"
                    style={{ fontFamily: `'${font.family}', monospace` }}
                  >
                    <span className="text-ansi-blue">=&gt;</span>{' '}
                    <span className="text-ansi-red">!==</span>{' '}
                    <span className="text-ansi-yellow">&lt;=</span>
                  </p>
                  <p className="text-muted-foreground mt-3 text-sm">
                    {font.name}
                  </p>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-8 text-sm">
              Bundled Nerd Fonts, with ligatures where the font has them.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {themes.map((theme) => (
              <button
                key={theme.id}
                type="button"
                aria-pressed={theme.id === activeId}
                onClick={() => {
                  activeIdState[1](theme.id)
                  applyTheme(theme)
                }}
                style={{
                  backgroundColor: theme.colors.background,
                  color: theme.colors.foreground,
                  outlineColor: theme.colors.palette[4],
                }}
                className={cn(
                  'flex min-w-0 flex-col gap-3 rounded-xl border p-3 text-left sm:p-4 transition-transform duration-200 hover:-translate-y-0.5',
                  theme.id === activeId && 'outline-2 outline-offset-2'
                )}
              >
                <span className="truncate font-mono text-xs sm:text-sm">
                  {theme.name}
                </span>
                <span className="flex h-2.5 overflow-hidden rounded-sm">
                  {theme.colors.palette.slice(1, 7).map((color, index) => (
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
        </div>
      </div>
    </section>
  )
}
