import {
  Alert02Icon,
  ArrowLeft02Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Color } from 'colorthief'
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogTitle } from '@/components/ui/dialog'
import { MachineLogo } from '@/constants/machine-icons'
import { deviceStyles } from '@/features/sidebar/device-variants'
import { frameStyles } from '@/features/sidebar/frame-styles'
import {
  logoCanvas,
  renderStyle,
  styles,
  themes,
} from '@/features/sidebar/icon-variants'
import { logoColors } from '@/features/sidebar/logo-colors'
import { getState, useStore } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

const COMPARE_SIZE = 64
const PIXEL_DIFFERENCE = 32
const MATCH_SHARE = 0.01
export type IconMatch = {
  name: string
  logo: string
  machine: string
}

export async function findIconMatches(
  logo: string,
  machine: string,
  projectId: string
) {
  const target = await pixels(logo)
  const matches: IconMatch[] = []
  for (const other of await otherIcons(machine, projectId)) {
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
  const [source, setSource] = useState<{
    image: HTMLImageElement
    colors: Color[]
    device: HTMLImageElement
    taken: Uint8ClampedArray[]
  } | null>(null)
  const [theme, setTheme] = useState('Most used 1')
  const [variants, setVariants] = useState<
    { label: string; logo: string }[] | null
  >(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const logo = props.matching.logo
  const other = props.matching.matches[0]
  const choices = source === null ? [] : themes(source.colors)
  const selectedLogo =
    variants?.find((variant) => variant.label === selected)?.logo ?? null

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const taken = [
          await pixels(logo),
          ...(await otherIcons(props.machine, props.projectId)).map(
            (item) => item.pixels
          ),
        ]
        const owner = getState().machines.find(
          (item) => item.id === props.machine
        )
        if (owner === undefined) {
          throw new Error('This machine is no longer available')
        }
        const device = await deviceIcon(owner.icon)
        const image = await load(logo)
        const colors = logoColors(image)
        if (!cancelled) {
          setSource({ image, colors, device, taken })
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
  }, [logo, props.machine, props.projectId])

  useEffect(() => {
    if (source === null) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const picked = themes(source.colors).find(
          (item) => item.label === theme
        )
        if (picked === undefined) {
          throw new Error(`${theme} is not an icon color`)
        }
        const base = logoCanvas(source.image, picked.tint)
        const next: { label: string; logo: string }[] = []
        for (const style of [
          ...styles(picked.accent),
          ...frameStyles(),
          ...deviceStyles(),
        ]) {
          const rendered = renderStyle(base, style, picked, source.device)
          const own = await pixels(rendered)
          if (source.taken.every((item) => !same(own, item))) {
            next.push({ label: style.label, logo: rendered })
          }
        }
        if (!cancelled) {
          setVariants(next)
          setSelected((current) => {
            if (
              current !== null &&
              next.some((variant) => variant.label === current)
            ) {
              return current
            }
            if (next.length === 0) {
              return null
            }
            return next[0].label
          })
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
  }, [source, theme])

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
          {selectedLogo === null ? (
            <span className="bg-muted size-8 flex-none rounded-lg" />
          ) : (
            <img
              src={selectedLogo}
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
      <div
        role="radiogroup"
        aria-label="Icon color"
        className="mx-5 mt-3 flex [scrollbar-width:none] gap-1 overflow-x-auto"
      >
        {choices.map((item) => (
          <button
            key={item.label}
            type="button"
            role="radio"
            aria-checked={item.label === theme}
            className={cn(
              'flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
              item.label === theme
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
            )}
            onClick={() => setTheme(item.label)}
          >
            {item.swatch !== null && (
              <span
                className="ring-foreground/20 size-2.5 flex-none rounded-full ring-1"
                style={{ backgroundColor: item.swatch }}
              />
            )}
            {item.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-6 gap-1">
          {variants === null &&
            error === null &&
            Array.from({ length: 6 }, (_, index) => (
              <span key={index} className="block p-2">
                <span className="bg-muted mx-auto block aspect-square w-full max-w-11 rounded-lg" />
              </span>
            ))}
          {variants !== null &&
            variants.map((variant) => (
              <button
                key={variant.label}
                type="button"
                title={variant.label}
                aria-label={variant.label}
                aria-pressed={selected === variant.label}
                className={cn(
                  'hover:bg-muted cursor-pointer rounded-lg p-2 transition-colors',
                  selected === variant.label && 'bg-muted ring-ring ring-1'
                )}
                onClick={() => setSelected(variant.label)}
              >
                <img
                  src={variant.logo}
                  alt=""
                  className="ring-foreground/10 mx-auto aspect-square w-full max-w-11 rounded-lg object-cover ring-1"
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
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => props.onUse(logo)}
        >
          Use original
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={selectedLogo === null}
          onClick={() => {
            if (selectedLogo !== null) {
              props.onUse(selectedLogo)
            }
          }}
        >
          Use icon
        </Button>
      </div>
    </>
  )
}

async function otherIcons(machine: string, projectId: string) {
  const state = getState()
  const icons: { match: IconMatch; pixels: Uint8ClampedArray }[] = []
  for (const project of state.projects) {
    const owner = state.machines.find((item) => item.id === project.machine)
    if (
      (project.machine === machine && project.id === projectId) ||
      project.logo === null ||
      project.scratch ||
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

async function deviceIcon(icon: string | null) {
  const holder = document.createElement('div')
  const root = createRoot(holder)
  flushSync(() => root.render(<MachineLogo icon={icon} />))
  const markup = holder.innerHTML.replaceAll(
    'stroke-width="1.5"',
    'stroke-width="2.25"'
  )
  root.unmount()
  return load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`)
}

async function load(source: string) {
  const image = new Image()
  image.src = source
  await image.decode()
  return image
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
