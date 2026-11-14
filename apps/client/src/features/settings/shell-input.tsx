import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { Platform } from '@offsite/core/config'
import { SHELL_LOGOS } from '@offsite/core/icons/shells'
import { useEffect, useState } from 'react'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/utils'

type Shell = { name: string; path: string | null }

const logoNames: Record<string, keyof typeof SHELL_LOGOS> = {
  zsh: 'zsh',
  bash: 'bash',
  fish: 'fish',
  pwsh: 'powershell',
  powershell: 'powershell',
  cmd: 'cmd',
}

const knownShells: Record<Platform, string[]> = {
  macos: ['zsh', 'bash', 'fish', 'pwsh'],
  linux: ['bash', 'zsh', 'fish', 'pwsh'],
  windows: ['pwsh', 'powershell', 'cmd'],
}

function logoFor(command: string) {
  const name = command
    .trim()
    .split(/[\\/]/)
    .pop()
    ?.toLowerCase()
    .replace(/\.exe$/, '')
  return name === undefined ? undefined : logoNames[name]
}

function folderOf(path: string) {
  return path.replace(/[\\/][^\\/]*$/, '')
}

function ShellLogo(props: { logo: keyof typeof SHELL_LOGOS }) {
  return (
    <svg viewBox="0 0 24 24" className="size-4 flex-none" fill="currentColor">
      <path d={SHELL_LOGOS[props.logo]} />
    </svg>
  )
}

export function ShellInput(props: {
  machine: string
  platform: Platform
  device: Platform
  value: string | null
  onCommit: (command: string | null) => void
}) {
  const [text, setText] = useState(props.value ?? '')
  const logo = logoFor(text)

  function commit(next: string) {
    setText(next)
    if (next === (props.value ?? '')) {
      return
    }
    props.onCommit(next === '' ? null : next)
  }

  return (
    <div className="relative w-56">
      {logo && (
        <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2">
          <ShellLogo logo={logo} />
        </span>
      )}
      <Input
        className={logo ? 'pr-9 pl-8' : 'pr-9'}
        placeholder="System default"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Known shells"
            className="text-muted-foreground absolute top-1/2 right-1.5 -translate-y-1/2"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <ShellMenu
            machine={props.machine}
            platform={props.platform}
            device={props.device}
            onCommit={commit}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ShellMenu(props: {
  machine: string
  platform: Platform
  device: Platform
  onCommit: (command: string) => void
}) {
  const [installed, setInstalled] = useState<Shell[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isDevice = props.platform === props.device
  const shells: Shell[] | null = isDevice
    ? installed
    : knownShells[props.platform].map((name) => ({ name, path: null }))

  useEffect(() => {
    if (!isDevice) {
      return
    }
    call(props.machine, 'terminal.shells', undefined).then(
      setInstalled,
      (failure: unknown) => setError(errorMessage(failure))
    )
  }, [props.machine, isDevice])

  return (
    <>
      {error && (
        <p className="text-destructive px-2 py-1.5 text-xs wrap-anywhere">
          {error}
        </p>
      )}
      {shells?.length === 0 && (
        <p className="text-muted-foreground px-2 py-1.5 text-xs">
          No known shells found
        </p>
      )}
      {shells?.map((shell) => (
        <DropdownMenuItem
          key={shell.path ?? shell.name}
          onSelect={() => props.onCommit(shell.path ?? shell.name)}
        >
          <ShellLogo logo={logoNames[shell.name]} />
          {shell.name}
          {shell.path !== null && (
            <span
              className="text-muted-foreground ml-auto min-w-0 truncate pl-3 text-xs [direction:rtl]"
              title={shell.path}
            >
              <bdi>{folderOf(shell.path)}</bdi>
            </span>
          )}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => props.onCommit('')}>
        System default
      </DropdownMenuItem>
    </>
  )
}
