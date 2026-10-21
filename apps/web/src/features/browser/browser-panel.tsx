import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  LinkSquare02Icon,
  RefreshCwIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useSearch } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { call, machineUrl } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { machineOf, useStore } from '@/lib/store'
import { openBrowser, replaceSearch } from '@/lib/url'
import { cn, errorMessage } from '@/lib/utils'

const pageMessage = z.discriminatedUnion('event', [
  z.object({
    offsite: z.literal('browser'),
    event: z.literal('location'),
    url: z.string(),
    proxied: z.string(),
    back: z.boolean(),
    forward: z.boolean(),
  }),
  z.object({ offsite: z.literal('browser'), event: z.literal('navigate') }),
])

export function BrowserPanel(props: {
  machine: string
  onClose: () => void
}) {
  const target = useSearch({
    from: '__root__',
    select: (search) => search.browse ?? null,
  })
  const [loaded, setLoaded] = useState<{
    target: string
    src: string | null
    href: string | null
    error: string | null
  } | null>(null)
  const [version, setVersion] = useState(0)
  const [frameKey, setFrameKey] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState<{
    back: boolean
    forward: boolean
    proxied: string
  } | null>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const followed = useRef<string | null>(null)
  const online = useStore(
    (state) => machineOf(state, props.machine).status === 'online'
  )

  useEffect(() => {
    if (target === null || !online) {
      return
    }
    if (followed.current === target) {
      followed.current = null
      return
    }
    let current = true
    browserSource(props.machine, target).then(
      (src) => {
        if (current) {
          setLoaded({ target, src, href: src, error: null })
          setFrameKey((key) => key + 1)
          setPage(null)
          setLoading(true)
        }
      },
      (caught: unknown) => {
        if (current) {
          setLoaded({
            target,
            src: null,
            href: null,
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
      if (message.data.event === 'navigate') {
        setPage(null)
        setLoading(true)
        return
      }
      setPage({
        back: message.data.back,
        forward: message.data.forward,
        proxied: message.data.proxied,
      })
      if (target === null || loaded === null) {
        throw new Error('a page reported its location outside the browser')
      }
      const next = message.data.url
      if (next === target) {
        return
      }
      followed.current = next
      setLoaded({ ...loaded, target: next, href: message.data.proxied })
      replaceSearch({ browse: next })
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [target, loaded])

  const src = target === null ? null : (loaded?.src ?? null)
  const href = loaded?.target === target ? loaded.href : null
  const error = loaded?.target === target ? loaded.error : null
  const busy =
    target !== null && online && (loaded?.target !== target || loading)

  function command(name: 'back' | 'forward' | 'reload') {
    if (page === null) {
      throw new Error('no page is open to send a browser command to')
    }
    frame.current?.contentWindow?.postMessage(
      { offsite: 'browser', command: name },
      new URL(page.proxied).origin
    )
  }

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background flex h-(--workspace-topbar-height) shrink-0 items-center gap-2 border-b pr-3 pl-3">
        <Button
          size="icon-sm"
          variant="ghost"
          title="Close"
          aria-label="Close"
          onClick={props.onClose}
        >
          <HugeiconsIcon icon={XIcon} className="size-3.5" />
        </Button>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            title="Back"
            aria-label="Back"
            disabled={page?.back !== true}
            onClick={() => command('back')}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            title="Forward"
            aria-label="Forward"
            disabled={page?.forward !== true}
            onClick={() => command('forward')}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
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
              className={cn('size-3.5', busy && 'animate-spin')}
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
        <div className="flex shrink-0 items-center gap-1">
          {href !== null && (
            <Button size="icon-sm" variant="ghost" asChild>
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in a new tab"
                aria-label="Open in a new tab"
              >
                <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" />
              </a>
            </Button>
          )}
        </div>
      </div>
      {error !== null && (
        <p className="text-muted-foreground p-4 text-center text-xs">{error}</p>
      )}
      {target === null && (
        <p className="text-muted-foreground p-4 text-center text-xs">
          Type a URL or a file path above. URLs load from this machine.
        </p>
      )}
      {src !== null && (
        <iframe
          key={frameKey}
          ref={frame}
          src={src}
          title={target ?? ''}
          className="min-h-0 w-full flex-1 bg-white"
          onLoad={() => setLoading(false)}
        />
      )}
    </div>
  )
}

async function browserSource(machine: string, target: string) {
  if (/^https?:\/\//i.test(target)) {
    const address = new URL(target)
    const proxy = new URL(machineUrl(machine))
    proxy.port = String(
      await call(machine, 'browser.proxy', { origin: address.origin })
    )
    return `${proxy.origin}${address.pathname}${address.search}${address.hash}`
  }
  const token = await call(machine, 'files.browse', undefined)
  return `${machineUrl(machine)}/api/browse/${token}${browsePath(target)}`
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

function browsePath(file: string) {
  const encoded = file
    .replaceAll('\\', '/')
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  return encoded.startsWith('/') ? encoded : `/${encoded}`
}
