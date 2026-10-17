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
      <UpdateSection />
      <Button variant="outline" onClick={props.onRestore}>
        Restore browser defaults
      </Button>
    </>
  )
}

function UpdateSection() {
  const [status, setStatus] = useState<
    'idle' | 'checking' | 'updating' | 'current'
  >('idle')
  const [failure, setFailure] = useState<string | null>(null)

  async function check() {
    setStatus('checking')
    setFailure(null)
    try {
      const registration =
        'serviceWorker' in navigator
          ? await navigator.serviceWorker.getRegistration()
          : undefined
      if (registration === undefined) {
        location.reload()
        return
      }
      await registration.update()
      setStatus(
        registration.installing === null && registration.waiting === null
          ? 'current'
          : 'updating'
      )
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
          {status === 'updating' && (
            <span className="text-muted-foreground text-xs">
              Updating, the page reloads when it&apos;s ready
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={status === 'checking' || status === 'updating'}
            onClick={() => void check()}
          >
            Check for updates
          </Button>
        </div>
      </Row>
    </Section>
  )
}
