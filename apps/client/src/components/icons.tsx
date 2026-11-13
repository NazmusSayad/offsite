import {
  ChatGptIcon,
  MessageSquareDashedIcon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { CLAUDE_LOGO, OPENCODE_LOGO } from '@offsite/core/icons/providers'
import { NO_PROJECT } from '@offsite/core/projects'
import type { Provider } from '@offsite/core/providers'
import { projectOf, useStore } from '@/lib/store'
import { cn } from '@/lib/utils'

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
  projectId: string
  className?: string
}) {
  const project = useStore((state) =>
    projectOf(state, props.machine, props.projectId)
  )
  if (props.projectId === NO_PROJECT || project?.scratch === true) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'text-muted-foreground inline-flex size-4 shrink-0 items-center justify-center',
          props.className
        )}
      >
        <HugeiconsIcon icon={MessageSquareDashedIcon} className="size-full" />
      </span>
    )
  }
  return (
    <ProjectBadge
      name={project?.name ?? ''}
      logo={project?.logo ?? null}
      className={props.className}
    />
  )
}

export function MoreProjectsLabel(props: {
  projects: { machine: string; id: string }[]
  className: string
}) {
  return (
    <>
      <span
        className={cn(
          'text-muted-foreground grid shrink-0 place-items-center',
          props.className
        )}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
      </span>
      <span className="flex shrink-0 items-center -space-x-1.5">
        {props.projects.slice(0, 3).map((project) => (
          <ProjectIcon
            key={project.id}
            machine={project.machine}
            projectId={project.id}
            className={cn(
              'bg-popover ring-popover rounded-[5px] ring-2 [&>img]:rounded-[4px] [&>svg]:rounded-[4px]',
              props.className
            )}
          />
        ))}
      </span>
      <span className="text-muted-foreground min-w-0 flex-1 truncate">
        {props.projects.length} more
      </span>
    </>
  )
}

export function MoreLabel(props: { text: string; className: string }) {
  return (
    <>
      <HugeiconsIcon
        icon={MoreHorizontalIcon}
        className={cn('text-muted-foreground shrink-0', props.className)}
      />
      <span className="text-muted-foreground min-w-0 flex-1 truncate">
        {props.text}
      </span>
    </>
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
  for (const glyph of name.toLowerCase()) {
    index = (index * 31 + (glyph.codePointAt(0) ?? 0)) % colors.length
  }

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

function OpenCodeIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 240 300"
      aria-hidden="true"
      className={cn('fill-current', props.className)}
    >
      <path d={OPENCODE_LOGO.inner} opacity="0.4" />
      <path d={OPENCODE_LOGO.outer} />
    </svg>
  )
}

function ClaudeIcon(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 257"
      preserveAspectRatio="xMidYMid"
      aria-hidden="true"
      className={cn('fill-[#d97757]', props.className)}
    >
      <path d={CLAUDE_LOGO} />
    </svg>
  )
}
