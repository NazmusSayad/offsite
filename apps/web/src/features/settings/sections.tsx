import type { TerminalIdentity } from '@offsite/core/protocol'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { imagePasteKeys } from '@/features/terminal/clipboard'
import {
  notificationPermission,
  notificationsWanted,
  pushSubscribed,
  pushSupport,
  setNotificationsWanted,
  subscribePush,
  unsubscribePush,
  watchPermission,
} from '@/lib/notifications'
import type { TerminalPrefs } from '@/lib/prefs'
import { errorMessage, isMac } from '@/lib/utils'
import { Row, Section } from './controls'

type Behavior = TerminalPrefs['behavior']

export function BehaviorSection(props: {
  behavior: Behavior
  onChange: (value: Partial<Behavior>) => void
}) {
  return (
    <Section title="Behavior">
      <Row label="Modernize Shift+Enter">
        <Switch
          checked={props.behavior.modernizeShiftEnter}
          onCheckedChange={(modernizeShiftEnter) =>
            props.onChange({ modernizeShiftEnter })
          }
        />
      </Row>
      <Row
        label={`${imagePasteKeys.linux.label} (${imagePasteKeys.windows.label} on Windows machines) pastes images from the browser clipboard`}
      >
        <Switch
          checked={props.behavior.pasteBrowserImages}
          onCheckedChange={(pasteBrowserImages) =>
            props.onChange({ pasteBrowserImages })
          }
        />
      </Row>
      <Row label="Capture browser shortcuts">
        <Switch
          checked={props.behavior.captureShortcuts}
          onCheckedChange={(captureShortcuts) =>
            props.onChange({ captureShortcuts })
          }
        />
      </Row>
      <Row label="Click moves the cursor in the command line">
        <Switch
          checked={props.behavior.clickToMoveCursor}
          onCheckedChange={(clickToMoveCursor) =>
            props.onChange({ clickToMoveCursor })
          }
        />
      </Row>
      <Row label="Ask before closing a tab that is running a program">
        <Switch
          checked={props.behavior.confirmCloseBusyTab}
          onCheckedChange={(confirmCloseBusyTab) =>
            props.onChange({ confirmCloseBusyTab })
          }
        />
      </Row>
    </Section>
  )
}

export function UpdateSection() {
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
      <Row label="Load the newest version of offsite in this browser">
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

export function NotificationSection() {
  return (
    <Section title="Notifications">
      <Row label="Desktop notifications on this device">
        <NotificationSwitch />
      </Row>
      <Row label="Push terminal alerts when no offsite page is open">
        <PushSwitch />
      </Row>
    </Section>
  )
}

export function BellSection(props: {
  behavior: Behavior
  onChange: (value: Partial<Behavior>) => void
}) {
  return (
    <Section title="Terminal bell">
      <Row label="Flash the screen on bell">
        <Switch
          checked={props.behavior.bellFlash}
          onCheckedChange={(bellFlash) => props.onChange({ bellFlash })}
        />
      </Row>
      <Row label="Play a sound on bell">
        <Switch
          checked={props.behavior.bellSound}
          onCheckedChange={(bellSound) => props.onChange({ bellSound })}
        />
      </Row>
    </Section>
  )
}

export function IdentityRow(props: {
  identity: TerminalIdentity
  onChange: (identity: TerminalIdentity) => void
}) {
  return (
    <Row label="Report the terminal as">
      <Select value={props.identity} onValueChange={props.onChange}>
        <SelectTrigger className="w-56">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="offsite">offsite</SelectItem>
          <SelectItem value="ghostty">Ghostty</SelectItem>
          <SelectItem value="iterm2">iTerm2</SelectItem>
        </SelectContent>
      </Select>
    </Row>
  )
}

export function MacKeysSection(props: {
  behavior: Behavior
  onChange: (value: Partial<Behavior>) => void
}) {
  if (!isMac) return null
  return (
    <Section
      title="Mac keys"
      note="Meta keeps that Option key from typing @, | and other symbols. Safari and Firefox use US key positions"
    >
      <Row label="Use Option as Meta">
        <Select
          value={props.behavior.optionAsMeta}
          onValueChange={(optionAsMeta: Behavior['optionAsMeta']) =>
            props.onChange({ optionAsMeta })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="off">Off</SelectItem>
            <SelectItem value="left">Left Option</SelectItem>
            <SelectItem value="right">Right Option</SelectItem>
            <SelectItem value="both">Both Options</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </Section>
  )
}

function NotificationSwitch() {
  const [permission, setPermission] = useState(notificationPermission)
  const [wanted, setWanted] = useState(notificationsWanted)

  useEffect(() => {
    const current = notificationPermission()
    if (current === 'insecure' || current === 'unsupported') return
    const controller = new AbortController()
    watchPermission(controller.signal, () =>
      setPermission(notificationPermission())
    ).catch((error: unknown) =>
      console.error('could not watch the notification permission', error)
    )
    return () => controller.abort()
  }, [])

  async function toggle(checked: boolean) {
    await setNotificationsWanted(checked)
    setWanted(checked)
    setPermission(notificationPermission())
  }

  return (
    <div className="flex items-center gap-3">
      {permission === 'denied' && (
        <span className="text-muted-foreground text-xs">
          Blocked in the browser&apos;s site settings
        </span>
      )}
      {permission === 'insecure' && (
        <span className="text-muted-foreground text-xs">
          Needs https or localhost
        </span>
      )}
      {permission === 'unsupported' && (
        <span className="text-muted-foreground text-xs">
          Not supported in this browser
        </span>
      )}
      <Switch
        checked={permission === 'granted' && wanted}
        disabled={permission !== 'granted' && permission !== 'default'}
        onCheckedChange={(checked) => void toggle(checked)}
      />
    </div>
  )
}

function PushSwitch() {
  const [support, setSupport] = useState(pushSupport)
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(() => pushSupport() === 'supported')
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    if (pushSupport() !== 'supported') return
    let mounted = true
    async function load() {
      try {
        const value = await pushSubscribed()
        if (mounted) setSubscribed(value)
      } catch (error) {
        console.error('could not read the push subscription', error)
      }
      if (mounted) setBusy(false)
    }
    void load()
    return () => {
      mounted = false
    }
  }, [])

  async function toggle(checked: boolean) {
    setBusy(true)
    setFailure(null)
    try {
      if (checked) setSubscribed(await subscribePush())
      else {
        await unsubscribePush()
        setSubscribed(false)
      }
    } catch (error) {
      console.error('could not change push notifications', error)
      setFailure(errorMessage(error))
    }
    setSupport(pushSupport())
    setBusy(false)
  }

  return (
    <div className="flex items-center gap-3">
      {failure !== null && (
        <span className="text-muted-foreground text-xs">
          Could not update: {failure}
        </span>
      )}
      {support === 'denied' && (
        <span className="text-muted-foreground text-xs">
          Blocked in the browser&apos;s site settings
        </span>
      )}
      {support === 'hosted' && (
        <span className="text-muted-foreground text-xs">
          Only on a page served by offsite
        </span>
      )}
      {support === 'insecure' && (
        <span className="text-muted-foreground text-xs">
          Needs https or localhost
        </span>
      )}
      {support === 'install' && (
        <span className="text-muted-foreground text-xs">
          Add offsite to the Home Screen first
        </span>
      )}
      {support === 'unsupported' && (
        <span className="text-muted-foreground text-xs">
          Not supported in this browser
        </span>
      )}
      <Switch
        checked={support === 'supported' && subscribed}
        disabled={support !== 'supported' || busy}
        onCheckedChange={(checked) => void toggle(checked)}
      />
    </div>
  )
}
