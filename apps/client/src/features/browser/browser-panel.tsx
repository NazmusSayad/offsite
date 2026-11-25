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
import { machineOf, useStore } from '@/lib/store'
import { openBrowser } from '@/lib/url'
import { cn, errorMessage } from '@/lib/utils'

const RAW_LIMIT = 50 * 1024

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
  const opened = useRef<string | null>(null)
  const online = useStore(
    (state) => machineOf(state, props.machine).status === 'online'
  )
  const home = useStore(
    (state) => machineOf(state, props.machine).system?.homeDir ?? null
  )

  const web = target !== null && /^https?:\/\//i.test(target)
  const remote = useRemoteBrowser(
    props.machine,
    web && online ? target : null,
    version
  )

  useEffect(() => {
    if (target === null || web || !online) {
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
          setLoaded({ target, ...source, error: null })
          setRaw(source.file !== null && source.file.text.length > RAW_LIMIT)
          setFrameKey((key) => key + 1)
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
          setLoading(false)
        }
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, target, web, version, online])

  const src = target === null || web ? null : (loaded?.src ?? null)
  const file = target === null || web ? null : (loaded?.file ?? null)
  const href = !web && loaded?.target === target ? loaded.src : null
  const page = web ? remote.page : null
  const error = web
    ? (remote.error ?? page?.error ?? null)
    : loaded?.target === target
      ? loaded.error
      : null
  const busy =
    target !== null &&
    online &&
    (web
      ? remote.error === null && (page === null || page.loading)
      : loaded?.target !== target || loading)

  function reload() {
    if (target === null || page === null || remote.error !== null) {
      setVersion(version + 1)
      return
    }
    if (page.error !== null) {
      remote.send({ type: 'navigate', url: target })
      return
    }
    remote.send({ type: 'reload' })
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
            onClick={() => remote.send({ type: 'back' })}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            title="Forward"
            aria-label="Forward"
            disabled={page?.forward !== true}
            onClick={() => remote.send({ type: 'forward' })}
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
      {target !== null && web && online && (
        <RemoteScreen remote={remote} url={target} />
      )}
      {src !== null && file === null && (
        <iframe
          key={frameKey}
          src={src}
          title={target ?? ''}
          className="min-h-0 w-full flex-1 bg-white scheme-light"
          onLoad={() => setLoading(false)}
        />
      )}
    </div>
  )
}

async function browserSource(machine: string, target: string) {
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
