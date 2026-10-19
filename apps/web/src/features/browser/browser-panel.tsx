import {
  LinkSquare02Icon,
  RefreshCwIcon,
  XIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useSearch } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'
import { call, machineUrl } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { machineOf, useStore } from '@/lib/store'
import { openBrowser } from '@/lib/url'
import { errorMessage } from '@/lib/utils'

export function BrowserPanel(props: {
  machine: string
  toggles: ReactNode
  onClose: () => void
}) {
  const target = useSearch({
    from: '__root__',
    select: (search) => search.browse ?? null,
  })
  const [loaded, setLoaded] = useState<{
    target: string
    url: string | null
    error: string | null
  } | null>(null)
  const [version, setVersion] = useState(0)
  const online = useStore(
    (state) => machineOf(state, props.machine).status === 'online'
  )

  useEffect(() => {
    if (target === null || !online) {
      return
    }
    let current = true
    browserSource(props.machine, target).then(
      (url) => {
        if (current) {
          setLoaded({ target, url, error: null })
        }
      },
      (caught: unknown) => {
        if (current) {
          setLoaded({ target, url: null, error: errorMessage(caught) })
        }
      }
    )
    return () => {
      current = false
    }
  }, [props.machine, target, version, online])

  const shown = loaded?.target === target ? loaded : null
  const url = shown?.url ?? null

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
            openBrowser(
              /^[\w.-]+:\d+(\/|$)/.test(address) ? `http://${address}` : address
            )
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
          <Button
            size="icon-sm"
            variant="ghost"
            title="Reload"
            aria-label="Reload"
            onClick={() => setVersion(version + 1)}
          >
            <HugeiconsIcon icon={RefreshCwIcon} className="size-3.5" />
          </Button>
          {url !== null && (
            <Button size="icon-sm" variant="ghost" asChild>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in a new tab"
                aria-label="Open in a new tab"
              >
                <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" />
              </a>
            </Button>
          )}
          {props.toggles}
        </div>
      </div>
      {shown !== null && shown.error !== null && (
        <p className="text-muted-foreground p-4 text-center text-xs">
          {shown.error}
        </p>
      )}
      {target === null && (
        <p className="text-muted-foreground p-4 text-center text-xs">
          Type a URL or a file path above. URLs load from this machine.
        </p>
      )}
      {url !== null && (
        <iframe
          key={version}
          src={url}
          title={target ?? ''}
          className="min-h-0 w-full flex-1 bg-white"
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

function browsePath(file: string) {
  const encoded = file
    .replaceAll('\\', '/')
    .split('/')
    .map(encodeURIComponent)
    .join('/')
  return encoded.startsWith('/') ? encoded : `/${encoded}`
}
