import { ArrowDown01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { appIcons } from '@offsite/core/app-icons'
import { schemes } from '@offsite/core/schemes'
import { Collapsible } from 'radix-ui'
import { useState } from 'react'
import { call } from '@/api/connection'
import { connectAddresses } from '@/api/machines'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tooltip } from '@/components/ui/tooltip'
import { logger } from '@/lib/log'
import type { Prefs } from '@/lib/prefs'
import { showError, updatePrefs, useStore } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'
import { Row, Section } from './controls'

const log = logger.withTag('settings')

export function GeneralPage(props: { prefs: Prefs; onRestore: () => void }) {
  const prefs = props.prefs

  return (
    <>
      <Section title="Appearance">
        <Row label="Theme">
          <Select
            value={prefs.theme}
            onValueChange={(theme) => updatePrefs({ ...prefs, theme })}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {schemes.map((scheme) => (
                <SelectItem key={scheme.id} value={scheme.id}>
                  {scheme.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Section>
      <Section title="Sidebar">
        <Row label="Group active sessions by project in Inbox">
          <Switch
            checked={prefs.groupActiveByProject}
            onCheckedChange={(groupActiveByProject) =>
              updatePrefs({ ...prefs, groupActiveByProject })
            }
          />
        </Row>
        <Row label="Move sessions to Snooze when you send">
          <Switch
            checked={prefs.autoMoveToSnooze}
            onCheckedChange={(autoMoveToSnooze) =>
              updatePrefs({ ...prefs, autoMoveToSnooze })
            }
          />
        </Row>
      </Section>
      <Section title="Dictate button" note="Shows next to Send">
        <Row label="On mobile">
          <Switch
            checked={prefs.dictateButton.mobile}
            onCheckedChange={(mobile) =>
              updatePrefs({ ...prefs, dictateButton: { mobile } })
            }
          />
        </Row>
      </Section>
      <Section title="App">
        <AppIconRow />
        <UpdateRow />
      </Section>
      <div className="flex justify-center">
        <Button variant="ghost-muted" size="xs" onClick={props.onRestore}>
          Restore browser defaults
        </Button>
      </div>
    </>
  )
}

function UpdateRow() {
  const [updating, setUpdating] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  async function update() {
    setUpdating(true)
    setFailure(null)
    try {
      const registration =
        'serviceWorker' in navigator
          ? await navigator.serviceWorker.getRegistration()
          : undefined
      if (registration === undefined) {
        const response = await fetch(`/?update=${Date.now()}`, {
          cache: 'no-store',
        })
        if (!response.ok) {
          throw new Error(`the server answered ${response.status}`)
        }
      } else {
        await registration.update()
        const worker = registration.installing ?? registration.waiting
        if (worker !== null) {
          await activated(worker)
        }
      }
      location.reload()
    } catch (error) {
      log.error('could not update', error)
      setFailure(errorMessage(error))
      setUpdating(false)
    }
  }

  return (
    <Row label="Version">
      <div className="flex items-center gap-3">
        {failure !== null && (
          <span className="text-destructive text-xs">
            Could not update: {failure}
          </span>
        )}
        <span className="text-muted-foreground text-sm">
          {process.env.OFFSITE_VERSION ?? 'dev'}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={updating}
          onClick={() => void update()}
        >
          {updating && (
            <HugeiconsIcon icon={RefreshIcon} className="animate-spin" />
          )}
          {updating ? 'Updating…' : 'Update'}
        </Button>
      </div>
    </Row>
  )
}

async function activated(worker: ServiceWorker) {
  await new Promise<void>((resolve, reject) => {
    function settle() {
      if (worker.state === 'activated') {
        resolve()
      }
      if (worker.state === 'redundant') {
        reject(new Error('the new version failed to install'))
      }
    }
    worker.addEventListener('statechange', settle)
    settle()
  })
}

function AppIconRow() {
  const host = useStore((state) =>
    state.machines.find((machine) =>
      machine.addresses.some((address) =>
        (connectAddresses ?? [location.origin]).includes(address)
      )
    )
  )
  if (host === undefined || host.appIcon === null) {
    return null
  }
  const active = appIcons.find((icon) => icon.id === host.appIcon)
  if (active === undefined) {
    throw new Error(`unknown app icon ${host.appIcon}`)
  }

  return (
    <Collapsible.Root>
      <Collapsible.Trigger className="group hover:bg-accent/50 flex min-h-13 w-full items-center gap-3 px-4 py-2.5 text-left">
        <span className="flex-1 text-sm font-medium">Icon</span>
        <AppIconTile icon={active} className="size-7" />
        <span className="text-muted-foreground text-sm">{active.name}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className="text-muted-foreground size-4 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
        />
      </Collapsible.Trigger>
      <Collapsible.Content className="data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden motion-reduce:animate-none">
        <div className="grid grid-cols-8 gap-1.5 px-3 pt-1 pb-3 @max-lg:grid-cols-4">
          {appIcons.map((icon) => (
            <Tooltip key={icon.id} label={icon.name}>
              <button
                type="button"
                aria-label={icon.name}
                aria-pressed={active.id === icon.id}
                className={cn(
                  'hover:bg-accent flex h-16 items-center justify-center rounded-lg border border-transparent',
                  active.id === icon.id && 'border-primary bg-accent'
                )}
                onClick={() =>
                  call(host.id, 'appIcon.save', icon.id).catch(showError)
                }
              >
                <AppIconTile icon={icon} className="size-11" />
              </button>
            </Tooltip>
          ))}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

function AppIconTile(props: {
  icon: (typeof appIcons)[number]
  className: string
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center',
        props.icon.tile?.shape === 'rounded' && 'rounded-[22%]',
        props.icon.tile?.shape === 'circle' && 'rounded-full',
        props.icon.tile !== null && 'ring-border ring-1',
        props.className
      )}
      style={{ background: props.icon.tile?.color }}
    >
      <img
        src="/icon.svg"
        alt=""
        style={{ width: `${props.icon.scale * 100}%` }}
      />
    </span>
  )
}
