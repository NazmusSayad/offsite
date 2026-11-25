import {
  File01Icon,
  Globe02Icon,
  LockIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { openBrowser } from '@/lib/url'

export function AddressBar(props: {
  target: string | null
  home: string | null
  onReload: () => void
}) {
  const shown =
    props.target === null ? null : showAddress(props.target, props.home)
  return (
    <form
      className="relative min-w-0 flex-1"
      onSubmit={(event) => {
        event.preventDefault()
        const input = event.currentTarget.elements.namedItem('address')
        if (!(input instanceof HTMLInputElement)) {
          throw new Error('the address field is missing')
        }
        const address = input.value.trim()
        if (address === '') {
          return
        }
        input.blur()
        if (!/^~([\\/]|$)/.test(address)) {
          const next = browserAddress(address)
          if (next !== props.target) {
            openBrowser(next)
            return
          }
          input.value = next
          props.onReload()
          return
        }
        if (props.home === null) {
          throw new Error('the home folder of this machine is not known yet')
        }
        openBrowser(`${props.home}${address.slice(1)}`)
      }}
    >
      <input
        name="address"
        className="peer bg-muted/70 hover:bg-muted focus:bg-background focus:border-ring focus:ring-ring/33 placeholder:text-muted-foreground focus:text-foreground h-8 w-full min-w-0 rounded-full border border-transparent pr-3 pl-8 text-sm text-transparent caret-current transition-[background-color,border-color,box-shadow] outline-none focus:ring-3"
        placeholder="Search or type a URL or file path"
        aria-label="URL or file path"
        autoComplete="off"
        spellCheck={false}
        defaultValue={props.target ?? ''}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => {
          event.currentTarget.value = props.target ?? ''
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.currentTarget.blur()
          }
        }}
      />
      <HugeiconsIcon
        icon={shown?.icon ?? Search01Icon}
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2"
      />
      {shown !== null && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-3 left-8 flex items-center text-sm whitespace-pre peer-focus:hidden"
        >
          <span className="text-muted-foreground min-w-0 truncate">
            {shown.before}
          </span>
          <span className="text-foreground max-w-full shrink-0 truncate">
            {shown.main}
          </span>
          <span className="text-muted-foreground min-w-0 truncate">
            {shown.after}
          </span>
        </span>
      )}
    </form>
  )
}

function showAddress(target: string, home: string | null) {
  if (/^https?:\/\//i.test(target)) {
    const icon = /^https:/i.test(target) ? LockIcon : Globe02Icon
    if (!URL.canParse(target)) {
      return { icon, before: '', main: target, after: '' }
    }
    const url = new URL(target)
    const after = `${url.pathname}${url.search}${url.hash}`
    return {
      icon,
      before: '',
      main: url.host,
      after: after === '/' ? '' : after,
    }
  }
  const path =
    home !== null &&
    /^[\\/]/.test(target.slice(home.length)) &&
    target.startsWith(home)
      ? `~${target.slice(home.length)}`
      : target
  const name = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1
  return {
    icon: File01Icon,
    before: path.slice(0, name),
    main: path.slice(name),
    after: '',
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
