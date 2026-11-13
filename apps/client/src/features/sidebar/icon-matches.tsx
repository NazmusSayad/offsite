import {
  Alert02Icon,
  ArrowLeft02Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogTitle } from '@/components/ui/dialog'
import { getState, useStore } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

const VARIANT_SIZE = 256
const COMPARE_SIZE = 64
const PIXEL_DIFFERENCE = 32
const MATCH_SHARE = 0.01
const VARIANTS = [
  { label: 'Grayscale', filter: 'grayscale(1)', tint: null },
  { label: 'Dimmed', filter: 'opacity(0.55)', tint: null },
  { label: 'Dark', filter: 'brightness(0.55)', tint: null },
  { label: 'Inverted', filter: 'invert(1) hue-rotate(180deg)', tint: null },
  { label: 'Hue +120°', filter: 'hue-rotate(120deg)', tint: null },
  { label: 'Hue −120°', filter: 'hue-rotate(240deg)', tint: null },
  { label: 'Blue', filter: 'none', tint: '#3b82f6' },
  { label: 'Green', filter: 'none', tint: '#22c55e' },
  { label: 'Orange', filter: 'none', tint: '#f97316' },
  { label: 'Pink', filter: 'none', tint: '#ec4899' },
]

export type IconMatch = {
  name: string
  logo: string
  machine: string
}

export async function findIconMatches(logo: string, machine: string) {
  const target = await pixels(logo)
  const matches: IconMatch[] = []
  for (const other of await otherIcons(machine)) {
    if (same(target, other.pixels)) {
      matches.push(other.match)
    }
  }
  return matches
}

export type IconMatching = {
  logo: string
  matches: IconMatch[]
}

export function IconMatches(props: {
  matching: IconMatching
  machine: string
  projectId: string
  onUse: (logo: string) => void
  onBack: (() => void) | null
}) {
  const machine = useStore((state) =>
    state.machines.find((item) => item.id === props.machine)
  )
  const project = useStore((state) =>
    state.projects.find(
      (item) => item.machine === props.machine && item.id === props.projectId
    )
  )
  const [variants, setVariants] = useState<
    { label: string; logo: string }[] | null
  >(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logo = props.matching.logo
  const other = props.matching.matches[0]

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const taken = [
          await pixels(logo),
          ...(await otherIcons(props.machine)).map((item) => item.pixels),
        ]
        const image = await load(logo)
        const next = []
        for (const variant of VARIANTS) {
          const rendered = render(image, variant.filter, variant.tint)
          const own = await pixels(rendered)
          if (taken.every((item) => !same(own, item))) {
            next.push({ label: variant.label, logo: rendered })
          }
        }
        if (!cancelled) {
          setVariants([{ label: 'Original', logo }, ...next])
          setSelected(next.length === 0 ? logo : next[0].logo)
        }
      } catch (failure) {
        if (!cancelled) {
          setError(errorMessage(failure))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [logo, props.machine])

  return (
    <>
      <div className="flex items-center gap-2.5 pt-4 pr-3 pl-5">
        <HugeiconsIcon
          icon={Alert02Icon}
          className="size-4.5 flex-none text-amber-500"
        />
        <DialogTitle className="min-w-0 flex-1 truncate text-base">
          Already used on{' '}
          {new Intl.ListFormat('en').format(
            new Set(props.matching.matches.map((match) => match.machine))
          )}
        </DialogTitle>
        <DialogClose asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Close">
            <HugeiconsIcon icon={Cancel01Icon} />
          </Button>
        </DialogClose>
      </div>
      <div className="mx-5 mt-4 grid grid-cols-2 rounded-lg border">
        <div className="flex min-w-0 items-center gap-2.5 p-2.5">
          <img
            src={other.logo}
            alt=""
            className="ring-foreground/10 size-8 flex-none rounded-lg object-cover ring-1"
          />
          <div className="min-w-0">
            <p className="truncate text-xs">{other.name}</p>
            <p className="text-muted-foreground truncate text-[0.625rem]">
              {other.machine}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 border-l p-2.5">
          {selected === null ? (
            <span className="bg-muted size-8 flex-none rounded-lg" />
          ) : (
            <img
              src={selected}
              alt=""
              className="ring-foreground/10 size-8 flex-none rounded-lg object-cover ring-1"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-xs">{project?.name}</p>
            <p className="text-muted-foreground truncate text-[0.625rem]">
              {machine?.name}
            </p>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-6 gap-1">
          {variants === null &&
            error === null &&
            [{ label: 'Original' }, ...VARIANTS].map((variant) => (
              <span key={variant.label} className="grid place-items-center p-2">
                <span className="bg-muted size-11 rounded-lg" />
              </span>
            ))}
          {variants?.map((variant) => (
            <button
              key={variant.label}
              type="button"
              title={variant.label}
              aria-label={variant.label}
              aria-pressed={selected === variant.logo}
              className={cn(
                'hover:bg-muted grid cursor-pointer place-items-center rounded-lg p-2 transition-colors',
                selected === variant.logo && 'bg-muted ring-ring ring-1'
              )}
              onClick={() => setSelected(variant.logo)}
            >
              <img
                src={variant.logo}
                alt=""
                className="ring-foreground/10 size-11 rounded-lg object-cover ring-1"
              />
            </button>
          ))}
        </div>
        {error !== null && (
          <p className="text-destructive text-sm break-all">{error}</p>
        )}
      </div>
      <div className="bg-muted/40 flex items-center gap-2 border-t px-5 py-3">
        {props.onBack !== null && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={props.onBack}
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} />
            Back
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          disabled={selected === null}
          onClick={() => {
            if (selected !== null) {
              props.onUse(selected)
            }
          }}
        >
          {selected === logo ? 'Use same icon' : 'Use icon'}
        </Button>
      </div>
    </>
  )
}

async function otherIcons(machine: string) {
  const state = getState()
  const icons: { match: IconMatch; pixels: Uint8ClampedArray }[] = []
  for (const project of state.projects) {
    const owner = state.machines.find((item) => item.id === project.machine)
    if (
      project.machine === machine ||
      project.logo === null ||
      project.scratch ||
      project.parentId !== null ||
      owner === undefined
    ) {
      continue
    }
    try {
      icons.push({
        match: { name: project.name, logo: project.logo, machine: owner.name },
        pixels: await pixels(project.logo),
      })
    } catch {
      continue
    }
  }
  return icons
}

async function load(source: string) {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
}

function render(image: HTMLImageElement, filter: string, tint: string | null) {
  const width = image.naturalWidth === 0 ? VARIANT_SIZE : image.naturalWidth
  const height = image.naturalHeight === 0 ? VARIANT_SIZE : image.naturalHeight
  const scale = VARIANT_SIZE / Math.max(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const context = canvas.getContext('2d')
  if (context === null) {
    throw new Error('This browser cannot draw icon variants')
  }
  context.filter = filter
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  if (tint !== null) {
    context.filter = 'none'
    context.globalCompositeOperation = 'source-atop'
    context.globalAlpha = 0.5
    context.fillStyle = tint
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  return canvas.toDataURL('image/png')
}

async function pixels(source: string) {
  const image = await load(source)
  const canvas = document.createElement('canvas')
  canvas.width = COMPARE_SIZE
  canvas.height = COMPARE_SIZE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) {
    throw new Error('This browser cannot compare icons')
  }
  context.drawImage(image, 0, 0, COMPARE_SIZE, COMPARE_SIZE)
  return context.getImageData(0, 0, COMPARE_SIZE, COMPARE_SIZE).data
}

function same(first: Uint8ClampedArray, second: Uint8ClampedArray) {
  let differing = 0
  for (let index = 0; index < first.length; index += 4) {
    const firstAlpha = first[index + 3] / 255
    const secondAlpha = second[index + 3] / 255
    let largest = Math.abs(first[index + 3] - second[index + 3])
    for (let channel = 0; channel < 3; channel++) {
      largest = Math.max(
        largest,
        Math.abs(
          first[index + channel] * firstAlpha -
            second[index + channel] * secondAlpha
        )
      )
    }
    if (largest > PIXEL_DIFFERENCE) {
      differing++
    }
  }
  return differing / (first.length / 4) < MATCH_SHARE
}
