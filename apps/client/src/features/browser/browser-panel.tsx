import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  LinkSquare02Icon,
  RefreshCwIcon,
  SourceCodeIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useSearch } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { call, machineUrl } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  browsePath,
  canView,
  FileView,
  fileContent,
} from '@/features/browser/file-view'
import { PanelCloseButton } from '@/features/workspace/panel-close-button'
import { machineOf, showError, useStore } from '@/lib/store'
import { openBrowser, replaceSearch } from '@/lib/url'
import { cn, errorMessage } from '@/lib/utils'

const RAW_LIMIT = 50 * 1024

const pageMessage = z.discriminatedUnion('event', [
  z.object({
    offsite: z.literal('browser'),
    event: z.literal('location'),
    url: z.string(),
    replaced: z.boolean(),
  }),
  z.object({
    offsite: z.literal('browser'),
    event: z.literal('open'),
    url: z.string(),
  }),
  z.object({ offsite: z.literal('browser'), event: z.literal('loading') }),
])

export function BrowserPanel(props: {
  machine: string
  onClose: () => void
  mobile: boolean
}) {
  const target = useSearch({
    from: '__root__',
    select: (search) => search.browse ?? null,
  })
  const [loaded, setLoaded] = useState<{
    target: string
    src: string | null
    file: {
      target: string
      base: string
      text: string
      image: string | null
    } | null
    error: string | null
  } | null>(null)
  const [raw, setRaw] = useState(false)
  const [version, setVersion] = useState(0)
  const [frameKey, setFrameKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState<{
    back: boolean
    forward: boolean
  } | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const opened = useRef<string | null>(null)
  const trail = useRef<{ entries: string[]; index: number }>({
    entries: [],
    index: -1,
  })
  const online = useStore(
    (state) => machineOf(state, props.machine).status === 'online'
  )

  useEffect(() => {
    if (target === null || !online) {
      return
    }
    const request = `${props.machine} ${version} ${target}`
    if (opened.current === request) {
      return
    }
    let current = true
    browserSource(props.machine, target).then(
      (source) => {
        if (current) {
          opened.current = request
          trail.current = { entries: [], index: -1 }
          setLoaded({ target, ...source, error: null })
          setRaw(source.file !== null && source.file.text.length > RAW_LIMIT)
          setFrameKey((key) => key + 1)
          setPage(null)
          setLoading(source.file === null)
        }
      },
      (caught: unknown) => {
        if (current) {
          setLoaded({
            target,
            src: null,
            file: null,
            error: errorMessage(caught),
          })
          setPage(null)
          setLoading(false)
        }
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, target, version, online])

  useEffect(() => {
    function listen(event: MessageEvent) {
      if (
        event.source === null ||
        event.source !== frame.current?.contentWindow
      ) {
        return
      }
      const message = pageMessage.safeParse(event.data)
      if (!message.success) {
        return
      }
      if (message.data.event === 'loading') {
        setPage(null)
        setLoading(true)
        return
      }
      if (target === null || loaded === null) {
        throw new Error('a page reported its location outside the browser')
      }
      const next = message.data.url
      if (message.data.event === 'open') {
        call(props.machine, 'browser.open', { url: next, fromPage: true }).then(
          (path) => {
            opened.current = `${props.machine} ${version} ${next}`
            setLoaded({
              target: next,
              src: `${machineUrl(props.machine)}${path}`,
              file: null,
              error: null,
            })
            setLoading(true)
            replaceSearch({ browse: next })
          },
          showError
        )
        return
      }
      setPage(followTrail(trail.current, next, message.data.replaced))
      if (next === target) {
        return
      }
      opened.current = `${props.machine} ${version} ${next}`
      setLoaded({ ...loaded, target: next })
      replaceSearch({ browse: next })
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [props.machine, version, target, loaded])

  const web = target !== null && /^https?:\/\//i.test(target)
  const src = target === null ? null : (loaded?.src ?? null)
  const file = target === null ? null : (loaded?.file ?? null)
  const href = !web && loaded?.target === target ? loaded.src : null
  const error = loaded?.target === target ? loaded.error : null
  const busy =
    target !== null && online && (loaded?.target !== target || loading)

  function command(name: 'back' | 'forward' | 'reload') {
    if (page === null) {
      throw new Error('no page is open to send a browser command to')
    }
    frame.current?.contentWindow?.postMessage(
      { offsite: 'browser', command: name },
      '*'
    )
  }

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center gap-2 border-b pr-3 pl-3">
        <PanelCloseButton mobile={props.mobile} onClick={props.onClose} />
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            title="Back"
            aria-label="Back"
            disabled={page?.back !== true}
            onClick={() => command('back')}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            title="Forward"
            aria-label="Forward"
            disabled={page?.forward !== true}
            onClick={() => command('forward')}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            title="Reload"
            aria-label="Reload"
            onClick={() => {
              if (page === null) {
                setVersion(version + 1)
                return
              }
              command('reload')
            }}
          >
            <HugeiconsIcon
              icon={RefreshCwIcon}
              className={cn('size-4', busy && 'animate-spin')}
            />
          </Button>
        </div>
        <form
          key={target}
          className="min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            const value = new FormData(event.currentTarget).get('address')
            if (typeof value !== 'string') {
              throw new Error('the address field is missing')
            }
            const address = value.trim()
            if (address === '') {
              return
            }
            openBrowser(browserAddress(address))
          }}
        >
          <Input
            name="address"
            className="h-7 font-mono text-xs"
            placeholder="URL or file path"
            aria-label="URL or file path"
            defaultValue={target ?? ''}
          />
        </form>
        {file !== null && (
          <Button
            size="icon-sm"
            variant="ghost"
            title={raw ? 'Show rendered' : 'Show raw'}
            aria-label={raw ? 'Show rendered' : 'Show raw'}
            onClick={() => setRaw(!raw)}
          >
            <HugeiconsIcon
              icon={raw ? ViewIcon : SourceCodeIcon}
              className="size-4"
            />
          </Button>
        )}
        {href !== null && (
          <Button size="icon-sm" variant="ghost" asChild>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in a new tab"
              aria-label="Open in a new tab"
            >
              <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
            </a>
          </Button>
        )}
      </div>
      {error !== null && (
        <p className="text-muted-foreground p-4 text-center text-xs wrap-anywhere">
          {error}
        </p>
      )}
      {target === null && (
        <p className="text-muted-foreground p-4 text-center text-xs">
          Type a URL or a file path above. URLs load from this machine.
        </p>
      )}
      {file !== null && (
        <div className="min-h-0 flex-1 overflow-auto">
          <FileView
            target={file.target}
            base={file.base}
            text={file.text}
            image={file.image}
            raw={raw}
          />
        </div>
      )}
      {src !== null && file === null && (
        <iframe
          key={frameKey}
          ref={frame}
          src={src}
          sandbox={
            web
              ? 'allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-presentation allow-pointer-lock'
              : undefined
          }
          title={target ?? ''}
          className="min-h-0 w-full flex-1 bg-white scheme-light"
          onLoad={() => setLoading(false)}
        />
      )}
    </div>
  )
}

async function browserSource(machine: string, target: string) {
  if (/^https?:\/\//i.test(target)) {
    const path = await call(machine, 'browser.open', {
      url: target,
      fromPage: false,
    })
    return { src: `${machineUrl(machine)}${path}`, file: null }
  }
  const token = await call(machine, 'files.browse', undefined)
  const base = `${machineUrl(machine)}/api/browse/${token}`
  const content = canView(target)
    ? fileContent(await call(machine, 'files.readPath', { path: target }))
    : null
  return {
    src: `${base}${browsePath(target)}`,
    file: content === null ? null : { ...content, target, base },
  }
}

function followTrail(
  trail: { entries: string[]; index: number },
  url: string,
  replaced: boolean
) {
  if (replaced && trail.index >= 0) {
    trail.entries[trail.index] = url
  } else if (trail.entries[trail.index - 1] === url) {
    trail.index -= 1
  } else if (trail.entries[trail.index + 1] === url) {
    trail.index += 1
  } else if (trail.entries[trail.index] !== url) {
    trail.entries = [...trail.entries.slice(0, trail.index + 1), url]
    trail.index += 1
  }
  return {
    back: trail.index > 0,
    forward: trail.index < trail.entries.length - 1,
  }
}

function browserAddress(value: string) {
  if (
    /^(https?:\/\/|file:)/i.test(value) ||
    /^[/.]/.test(value) ||
    /^[a-z]:[\\/]/i.test(value)
  ) {
    return value
  }
  if (/^(localhost|\d+(\.\d+){3}|[\w.-]+:\d+)([:/?#]\S*)?$/i.test(value)) {
    return `http://${value}`
  }
  if (/^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(value)) {
    return `https://${value}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`
}
