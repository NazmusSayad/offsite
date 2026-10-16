import { ChatGptIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Provider } from '@server/protocol'
import { projectName } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useStore } from '@/store'

const colors = [
  'text-gray-600 dark:text-gray-400',
  'text-red-600 dark:text-red-400',
  'text-orange-600 dark:text-orange-400',
  'text-amber-600 dark:text-amber-400',
  'text-yellow-600 dark:text-yellow-400',
  'text-lime-600 dark:text-lime-400',
  'text-green-600 dark:text-green-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-teal-600 dark:text-teal-400',
  'text-cyan-600 dark:text-cyan-400',
  'text-sky-600 dark:text-sky-400',
  'text-blue-600 dark:text-blue-400',
  'text-indigo-600 dark:text-indigo-400',
  'text-violet-600 dark:text-violet-400',
  'text-purple-600 dark:text-purple-400',
  'text-fuchsia-600 dark:text-fuchsia-400',
  'text-pink-600 dark:text-pink-400',
  'text-rose-600 dark:text-rose-400',
]

export function ProjectIcon(props: {
  machine: string
  cwd: string
  className?: string
}) {
  const project = useStore((state) =>
    state.projects.find(
      (item) => item.machine === props.machine && item.path === props.cwd
    )
  )
  return (
    <ProjectBadge
      name={project?.name ?? projectName(props.cwd)}
      logo={project?.logo ?? null}
      className={props.className}
    />
  )
}

export function ProjectBadge(props: {
  name: string
  logo: string | null
  className?: string
}) {
  const name = props.name.normalize('NFKC').trim()
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? []
  const glyphs = Array.from(words[0] ?? 'P')
  const second =
    glyphs.slice(1).find((glyph) => /\p{N}/u.test(glyph)) ??
    (words.length > 1 ? Array.from(words.at(-1) ?? '')[0] : glyphs.at(-1)) ??
    glyphs[0]
  const text = Array.from(`${glyphs[0]}${second}`.toUpperCase())
    .slice(0, 2)
    .join('')
  let index = 0
  for (const glyph of name.toLowerCase())
    index = (index * 31 + (glyph.codePointAt(0) ?? 0)) % colors.length

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center',
        props.className
      )}
    >
      {props.logo !== null ? (
        <img
          src={props.logo}
          alt=""
          className="size-full rounded-[25%] object-cover"
        />
      ) : (
        <svg
          viewBox="0 0 16 16"
          className={cn(
            'size-full overflow-hidden rounded-[25%] font-mono select-none',
            colors[index]
          )}
          style={{
            backgroundColor:
              'color-mix(in srgb, currentColor 14%, transparent)',
          }}
        >
          <text
            x="8"
            y="10.8"
            textAnchor="middle"
            fill="currentColor"
            fontSize="8.25"
            fontWeight="700"
            textLength={text.length === 1 ? 6 : 12}
            lengthAdjust="spacingAndGlyphs"
          >
            {text}
          </text>
        </svg>
      )}
    </span>
  )
}

export function ProviderIcon(props: {
  provider: Provider
  className?: string
}) {
  switch (props.provider) {
    case 'claude':
      return <ClaudeIcon className={props.className} />
    case 'codex':
      return <HugeiconsIcon icon={ChatGptIcon} className={props.className} />
    case 'opencode':
      return <OpenCodeIcon className={props.className} />
  }
}

export function OpenCodeIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 300"
      aria-hidden="true"
      className={cn('fill-current', props.className)}
    >
      <path d="M180 240H60V120H180V240Z" opacity="0.4" />
      <path d="M180 60H60V240H180V60ZM240 300H0V0H240V300Z" />
    </svg>
  )
}

export function ClaudeIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 257"
      preserveAspectRatio="xMidYMid"
      aria-hidden="true"
      className={cn('fill-[#d97757]', props.className)}
    >
      <path d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z" />
    </svg>
  )
}
