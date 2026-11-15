import {
  CircleDotDashedIcon,
  Link01Icon,
  LockIcon,
  SmartPhone01Icon,
  SquareUnlock01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type PackageManager, packageManagers } from '@offsite/core/service'
import { useState } from 'react'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBusyReasons } from '@/features/service/busy-reasons'
import { readOptions, writeOptions } from '@/features/service/service-form'
import {
  TaskBusy,
  TaskError,
  TaskLine,
} from '@/features/sidebar/service-task-parts'
import type { Machine } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'

export function ServiceInstall(props: { machine: Machine }) {
  const machine = props.machine
  const service = machine.service
  const [manager, setManager] = useState<PackageManager | null>(
    service?.manager ?? null
  )
  const [options, setOptions] = useState(() =>
    readOptions(service?.arguments ?? [])
  )
  const [editing, setEditing] = useState<'address' | 'connect' | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busy = useBusyReasons(machine.id, setError)
  if (service === null || service.installed) {
    return null
  }
  const name = machine.name

  async function install() {
    setWorking(true)
    setError(null)
    try {
      if (manager === null) {
        throw new Error('Pick a package manager')
      }
      await call(machine.id, 'service.install', {
        manager,
        arguments: writeOptions(options),
      })
      toast.info(`OffSite - ${name} is restarting`)
    } catch (failure) {
      setError(errorMessage(failure))
      setWorking(false)
    }
  }

  function edit(next: 'address' | 'connect') {
    setEditing(editing === next ? null : next)
  }

  return (
    <>
      <TaskLine
        name={name}
        detail={null}
        action={
          <Button
            type="button"
            size="xs"
            variant={
              busy !== null && busy.length > 0 ? 'destructive' : 'default'
            }
            disabled={working || busy === null || manager === null}
            onClick={() => void install()}
          >
            {working && (
              <HugeiconsIcon
                icon={CircleDotDashedIcon}
                className="animate-spin"
              />
            )}
            {working ? 'Installing' : 'Install'}
          </Button>
        }
      />
      <div className="mt-2 flex flex-wrap gap-1">
        <Select
          value={manager ?? undefined}
          onValueChange={(value: PackageManager) => setManager(value)}
        >
          <SelectTrigger
            aria-label="Package manager"
            className={cn(
              'inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'h-6! py-0 pr-1 pl-1.5 dark:bg-transparent [&_svg]:size-3!',
              manager === null
                ? 'border-warning/60 text-warning! border-dashed'
                : 'border-sidebar-foreground/15 bg-sidebar-foreground/8 text-sidebar-foreground hover:bg-sidebar-foreground/12'
            )}
          >
            <SelectValue placeholder="Package manager" />
          </SelectTrigger>
          <SelectContent>
            {packageManagers.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          aria-expanded={editing === 'address'}
          title="Host and port"
          className={cn(
            'inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            'border-sidebar-foreground/15 bg-sidebar-foreground/8 text-sidebar-foreground hover:bg-sidebar-foreground/12',
            'font-mono',
            editing === 'address' && 'border-ring'
          )}
          onClick={() => edit('address')}
        >
          <span className="truncate">
            {options.host}:{options.port}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={options.auth}
          title={options.auth ? 'Sign-in required' : 'No sign-in'}
          className={cn(
            'inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            options.auth
              ? 'border-sidebar-foreground/15 bg-sidebar-foreground/8 text-sidebar-foreground hover:bg-sidebar-foreground/12'
              : 'border-dashed border-sidebar-foreground/20 text-muted-foreground hover:text-sidebar-foreground'
          )}
          onClick={() => {
            setOptions({ ...options, auth: !options.auth })
            if (editing === 'connect') {
              setEditing(null)
            }
          }}
        >
          <HugeiconsIcon
            icon={options.auth ? LockIcon : SquareUnlock01Icon}
            className="size-3"
          />
          Sign-in
        </button>
        {!options.auth && (
          <button
            type="button"
            aria-expanded={editing === 'connect'}
            title="Auto-connect URLs"
            className={cn(
              'inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
              options.connect === ''
                ? 'border-dashed border-sidebar-foreground/20 text-muted-foreground hover:text-sidebar-foreground'
                : 'border-sidebar-foreground/15 bg-sidebar-foreground/8 text-sidebar-foreground hover:bg-sidebar-foreground/12',
              editing === 'connect' && 'border-ring'
            )}
            onClick={() => edit('connect')}
          >
            <HugeiconsIcon icon={Link01Icon} className="size-3 shrink-0" />
            <span className="truncate">
              {options.connect === '' ? 'Auto-connect' : options.connect}
            </span>
          </button>
        )}
        <button
          type="button"
          aria-pressed={options.pwa}
          title={options.pwa ? 'Installs as an app' : 'Not installed as an app'}
          className={cn(
            'inline-flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md border px-1.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
            options.pwa
              ? 'border-sidebar-foreground/15 bg-sidebar-foreground/8 text-sidebar-foreground hover:bg-sidebar-foreground/12'
              : 'border-dashed border-sidebar-foreground/20 text-muted-foreground hover:text-sidebar-foreground'
          )}
          onClick={() => setOptions({ ...options, pwa: !options.pwa })}
        >
          <HugeiconsIcon icon={SmartPhone01Icon} className="size-3" />
          App (PWA)
        </button>
      </div>
      {editing === 'address' && (
        <div className="animate-in fade-in mt-1.5 flex gap-1 duration-150">
          <input
            ref={focusOnMount}
            aria-label="Host"
            className={cn(
              'h-8 min-w-0 rounded-md border border-input bg-input/30 px-2 font-mono text-base text-sidebar-foreground md:h-7 md:text-xs outline-none focus-visible:border-ring',
              'flex-1'
            )}
            value={options.host}
            onChange={(event) =>
              setOptions({ ...options, host: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') {
                setEditing(null)
              }
            }}
          />
          <input
            type="number"
            min={1}
            max={65535}
            aria-label="Port"
            className={cn(
              'h-8 min-w-0 rounded-md border border-input bg-input/30 px-2 font-mono text-base text-sidebar-foreground md:h-7 md:text-xs outline-none focus-visible:border-ring',
              'w-16'
            )}
            value={options.port}
            onChange={(event) =>
              setOptions({ ...options, port: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === 'Escape') {
                setEditing(null)
              }
            }}
          />
        </div>
      )}
      {editing === 'connect' && !options.auth && (
        <input
          ref={focusOnMount}
          aria-label="Auto-connect URLs"
          placeholder="https://example.com"
          className={cn(
            'h-8 min-w-0 rounded-md border border-input bg-input/30 px-2 font-mono text-base text-sidebar-foreground md:h-7 md:text-xs outline-none focus-visible:border-ring',
            'animate-in fade-in mt-1.5 w-full duration-150'
          )}
          value={options.connect}
          onChange={(event) =>
            setOptions({ ...options, connect: event.target.value })
          }
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              setEditing(null)
            }
          }}
        />
      )}
      <TaskBusy busy={busy} />
      <TaskError error={error} />
    </>
  )
}

function focusOnMount(element: HTMLInputElement | null) {
  element?.focus()
}
