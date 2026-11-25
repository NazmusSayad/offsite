import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  LinkSquare02Icon,
  RefreshCwIcon,
  SourceCodeIcon,
  Video01Icon,
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
import { RemoteScreen } from '@/features/browser/remote-screen'
import { useRemoteBrowser } from '@/features/browser/use-remote-browser'
import { PanelCloseButton } from '@/features/workspace/panel-close-button'
import {
  getState,
  machineOf,
  showError,
  updatePrefs,
  useStore,
} from '@/lib/store'
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
  const home = useStore(
    (state) => machineOf(state, props.machine).system?.homeDir ?? null
  )
  const view = useStore((state) => state.prefs.browserView)
  const web = target !== null && /^https?:\/\//i.test(target)
  const streamed = web && view === 'video'
  const remote = useRemoteBrowser(
    props.machine,
    streamed && online ? target : null,
    version
  )

  useEffect(() => {
    if (streamed) {
      opened.current = null
      return
    }
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
  }, [props.machine, target, streamed, version, online])

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

  const src = target === null || streamed ? null : (loaded?.src ?? null)
  const file = target === null || streamed ? null : (loaded?.file ?? null)
  const href = !web && loaded?.target === target ? loaded.src : null
  const history = streamed ? remote.page : page
  const error = streamed
    ? (remote.error ?? remote.page?.error ?? null)
    : loaded?.target === target
      ? loaded.error
      : null
  const busy =
    target !== null &&
    online &&
    (streamed
      ? remote.error === null && (remote.page === null || remote.page.loading)
      : loaded?.target !== target || loading)

  function command(name: 'back' | 'forward' | 'reload') {
    if (streamed) {
      remote.send({ type: name })
      return
    }
    if (page === null) {
      throw new Error('no page is open to send a browser command to')
    }
    frame.current?.contentWindow?.postMessage(
      { offsite: 'browser', command: name },
      '*'
    )
  }

  function reload() {
    if (target === null || history === null || remote.error !== null) {
      setVersion(version + 1)
      return
    }
    if (streamed && remote.page !== null && remote.page.error !== null) {
      remote.send({ type: 'navigate', url: target })
      return
    }
    command('reload')
  }

  return (
    <div className="bg-background flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/60 bg-background shrink-0 border-b px-3 pb-2">
        <div className="flex h-(--workspace-topbar-height) items-center gap-2">
          <PanelCloseButton mobile={props.mobile} onClick={props.onClose} />
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="icon-sm"
              variant="ghost"
              title="Back"
              aria-label="Back"
              disabled={history?.back !== true}
              onClick={() => command('back')}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              title="Forward"
              aria-label="Forward"
              disabled={history?.forward !== true}
              onClick={() => command('forward')}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              title="Reload"
              aria-label="Reload"
              onClick={reload}
            >
              <HugeiconsIcon
                icon={RefreshCwIcon}
                className={cn('size-4', busy && 'animate-spin')}
              />
            </Button>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {web && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="aria-pressed:bg-accent"
                title="Video"
                aria-label="Video"
                aria-pressed={streamed}
                onClick={() =>
                  updatePrefs({
                    ...getState().prefs,
                    browserView: streamed ? 'proxy' : 'video',
                  })
                }
              >
                <HugeiconsIcon icon={Video01Icon} className="size-4" />
              </Button>
            )}
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
        </div>
        <form
          key={target}
          className="min-w-0"
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
            if (!/^~([\\/]|$)/.test(address)) {
              const next = browserAddress(address)
              if (next !== target) {
                openBrowser(next)
                return
              }
              const input = event.currentTarget.elements.namedItem('address')
              if (!(input instanceof HTMLInputElement)) {
                throw new Error('the address field is missing')
              }
              input.value = next
              reload()
              return
            }
            if (home === null) {
              throw new Error(
                'the home folder of this machine is not known yet'
              )
            }
            openBrowser(`${home}${address.slice(1)}`)
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
      {target !== null && streamed && online && (
        <RemoteScreen remote={remote} url={target} />
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
