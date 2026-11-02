import { schemes } from '@offsite/core/schemes'
import { useState } from 'react'
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
import { updatePrefs } from '@/lib/store'
import { errorMessage } from '@/lib/utils'
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
      <UpdateSection />
      <Button variant="outline" onClick={props.onRestore}>
        Restore browser defaults
      </Button>
    </>
  )
}

function UpdateSection() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'current'>('idle')
  const [failure, setFailure] = useState<string | null>(null)

  async function check() {
    setStatus('checking')
    setFailure(null)
    try {
      const registration =
        'serviceWorker' in navigator
          ? await navigator.serviceWorker.getRegistration()
          : undefined
      if (registration !== undefined) {
        await registration.update()
        const worker = registration.installing ?? registration.waiting
        if (worker !== null) {
          await activated(worker)
        }
      }
      if ((await latestEntry()) === currentEntry()) {
        setStatus('current')
        return
      }
      location.reload()
    } catch (error) {
      console.error('could not check for updates', error)
      setFailure(errorMessage(error))
      setStatus('idle')
    }
  }

  return (
    <Section title="App">
      <Row label="Load the newest version of OffSite in this browser">
        <div className="flex items-center gap-3">
          {failure !== null && (
            <span className="text-muted-foreground text-xs">
              Could not check: {failure}
            </span>
          )}
          {status === 'current' && (
            <span className="text-muted-foreground text-xs">Up to date</span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={status === 'checking'}
            onClick={() => void check()}
          >
            Check for updates
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

function currentEntry() {
  const entry = document
    .querySelector('script[type="module"][src]')
    ?.getAttribute('src')
  if (entry === null || entry === undefined) {
    throw new Error('this page has no entry script')
  }
  return entry
}

async function latestEntry() {
  const response = await fetch(`/?update=${Date.now()}`, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`the server answered ${response.status}`)
  }
  const entry = new DOMParser()
    .parseFromString(await response.text(), 'text/html')
    .querySelector('script[type="module"][src]')
    ?.getAttribute('src')
  if (entry === null || entry === undefined) {
    throw new Error('the server page has no entry script')
  }
  return entry
}
