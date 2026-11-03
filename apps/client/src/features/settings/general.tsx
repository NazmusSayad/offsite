import { RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { appIcons } from '@offsite/core/app-icons'
import { schemes } from '@offsite/core/schemes'
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
import type { Prefs } from '@/lib/prefs'
import { showError, updatePrefs, useStore } from '@/lib/store'
import { cn, errorMessage } from '@/lib/utils'
import { Row, Section } from './controls'

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
      </Section>
      <AppIconSection />
      <UpdateSection />
      <Button variant="outline" onClick={props.onRestore}>
        Restore browser defaults
      </Button>
    </>
  )
}

function UpdateSection() {
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
      console.error('could not update', error)
      setFailure(errorMessage(error))
      setUpdating(false)
    }
  }

  return (
    <Section title="App">
      <Row label="Load the newest version of OffSite in this browser">
        <div className="flex items-center gap-3">
          {failure !== null && (
            <span className="text-destructive text-xs">
              Could not update: {failure}
            </span>
          )}
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
    </Section>
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

function AppIconSection() {
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
  const selected = host.appIcon

  return (
    <Section title="App icon">
      <div className="grid grid-cols-4 gap-2 p-3 @max-lg:grid-cols-2">
        {appIcons.map((icon) => (
          <button
            key={icon.id}
            type="button"
            aria-pressed={selected === icon.id}
            className={cn(
              'hover:bg-accent flex flex-col items-center gap-2 rounded-lg border p-3 text-xs',
              selected === icon.id && 'border-primary bg-accent'
            )}
            onClick={() =>
              call(host.id, 'appIcon.save', icon.id).catch(showError)
            }
          >
            <span
              className={cn(
                'flex size-12 items-center justify-center',
                icon.tile?.shape === 'rounded' && 'rounded-[22%]',
                icon.tile?.shape === 'circle' && 'rounded-full',
                icon.tile !== null && 'ring-border ring-1'
              )}
              style={{ background: icon.tile?.color }}
            >
              <img
                src="/icon.svg"
                alt=""
                style={{ width: `${icon.scale * 100}%` }}
              />
            </span>
            {icon.name}
          </button>
        ))}
      </div>
    </Section>
  )
}
