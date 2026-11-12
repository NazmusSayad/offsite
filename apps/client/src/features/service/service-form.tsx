import { type PackageManager, packageManagers } from '@offsite/core/service'
import { type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { call } from '@/api/connection'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useStore } from '@/lib/store'
import { errorMessage } from '@/lib/utils'

export function ServiceForm(props: {
  machine: string
  update: boolean
  onDone: () => void
  onCancel?: () => void
}) {
  const machine = useStore((state) =>
    state.machines.find((item) => item.id === props.machine)
  )
  const service = machine?.service ?? null
  const update = props.update ? (service?.update ?? null) : null
  const [manager, setManager] = useState<PackageManager | null>(
    service?.manager ?? null
  )
  const [options, setOptions] = useState(() =>
    readOptions(service?.arguments ?? [])
  )
  const [busy, setBusy] = useState<string[] | null>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const reasons = await call(props.machine, 'service.busy', undefined)
        if (active) {
          setBusy(reasons)
        }
      } catch (failure) {
        if (active) {
          setError(errorMessage(failure))
        }
      }
    })()
    return () => {
      active = false
    }
  }, [props.machine])

  if (machine === undefined || service === null) {
    return (
      <p className="text-muted-foreground text-sm">This machine is offline</p>
    )
  }

  const action =
    update !== null ? 'Update' : service.installed ? 'Save' : 'Install'

  async function confirm() {
    setWorking(true)
    setError(null)
    try {
      if (update !== null) {
        await call(props.machine, 'service.update', undefined)
      } else {
        if (manager === null) {
          throw new Error('Pick a package manager')
        }
        await call(props.machine, 'service.install', {
          manager,
          arguments: writeOptions(options),
        })
      }
      props.onDone()
      toast(`OffSite - ${machine?.name} is restarting`)
    } catch (failure) {
      setError(errorMessage(failure))
      setWorking(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      {update === null && (
        <>
          <label className="flex flex-col gap-2">
            <span className="font-medium">Package manager</span>
            <Select
              value={manager ?? undefined}
              onValueChange={(value: PackageManager) => setManager(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick one" />
              </SelectTrigger>
              <SelectContent>
                {packageManagers.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="grid grid-cols-[1fr_6.5rem] gap-3">
            <Field label="Host">
              <Input
                className="font-mono"
                value={options.host}
                onChange={(event) =>
                  setOptions({ ...options, host: event.target.value })
                }
              />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                min={1}
                max={65535}
                className="font-mono"
                value={options.port}
                onChange={(event) =>
                  setOptions({ ...options, port: event.target.value })
                }
              />
            </Field>
          </div>
          <Toggle
            label="Authentication"
            checked={options.auth}
            onChange={(auth) => setOptions({ ...options, auth })}
          />
          {!options.auth && (
            <Field label="Auto-connect URLs">
              <Input
                className="font-mono"
                placeholder="https://example.com"
                value={options.connect}
                onChange={(event) =>
                  setOptions({ ...options, connect: event.target.value })
                }
              />
            </Field>
          )}
          <Toggle
            label="Install as app (PWA)"
            checked={options.pwa}
            onChange={(pwa) => setOptions({ ...options, pwa })}
          />
        </>
      )}
      {busy !== null && busy.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-destructive font-medium">Restarting stops:</p>
          <ul className="text-muted-foreground list-disc pl-5">
            {busy.map((reason, index) => (
              <li key={`${index} ${reason}`}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {error !== null && <p className="text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-2">
        {props.onCancel !== undefined && (
          <Button type="button" variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          variant={busy !== null && busy.length > 0 ? 'destructive' : 'default'}
          disabled={
            working || busy === null || (update === null && manager === null)
          }
          onClick={() => void confirm()}
        >
          {working ? `${action === 'Save' ? 'Sav' : action}ing…` : action}
        </Button>
      </div>
    </div>
  )
}

type Options = {
  host: string
  port: string
  auth: boolean
  pwa: boolean
  connect: string
  rest: string[]
}

function readOptions(list: string[]): Options {
  const options: Options = {
    host: '127.0.0.1',
    port: '2020',
    auth: true,
    pwa: false,
    connect: '',
    rest: [],
  }
  for (let index = 0; index < list.length; index++) {
    const item = list[index]
    if (item === '--host' || item === '--port' || item === '--connect') {
      options[
        item === '--host' ? 'host' : item === '--port' ? 'port' : 'connect'
      ] = list[index + 1] ?? ''
      index++
    } else if (item === '--no-auth') {
      options.auth = false
    } else if (item === '--pwa') {
      options.pwa = true
    } else {
      options.rest.push(item)
    }
  }
  return options
}

function writeOptions(options: Options) {
  const port = Number(options.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('The port must be a number from 1 to 65535')
  }
  if (options.host.trim() === '') {
    throw new Error('Fill in the host')
  }
  const connect = options.connect.replaceAll(' ', '')
  if (!options.auth && connect !== '') {
    for (const address of connect.split(',')) {
      const url = URL.parse(address)
      if (
        url === null ||
        (url.protocol !== 'http:' && url.protocol !== 'https:')
      ) {
        throw new Error(`${address} needs http:// or https://`)
      }
    }
  }
  return [
    '--host',
    options.host.trim(),
    '--port',
    String(port),
    ...(options.auth ? [] : ['--no-auth']),
    ...(options.pwa ? ['--pwa'] : []),
    ...(!options.auth && connect !== '' ? ['--connect', connect] : []),
    ...options.rest,
  ]
}

function Field(props: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="font-medium">{props.label}</span>
      {props.children}
    </label>
  )
}

function Toggle(props: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="font-medium">{props.label}</span>
      <Switch checked={props.checked} onCheckedChange={props.onChange} />
    </label>
  )
}
