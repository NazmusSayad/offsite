import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { Config, Platform, TerminalIdentity } from '@/config'
import {
  notificationPermission,
  notificationsWanted,
  setNotificationsWanted,
  watchPermission,
} from '@/notifications'
import { imagePasteKeys } from '@/paste'
import { Row, Section } from '@/settings-layout'

type Behavior = Config['behavior']

export function BehaviorSection(props: {
  behavior: Behavior
  platform: Platform
  onChange: (value: Partial<Behavior>) => void
}) {
  return (
    <Section title="Behavior">
      <Row label="Shift+Enter inserts a new line">
        <Switch
          checked={props.behavior.shiftEnterNewline}
          onCheckedChange={(shiftEnterNewline) =>
            props.onChange({ shiftEnterNewline })
          }
        />
      </Row>
      <Row
        label={`${imagePasteKeys[props.platform].label} pastes images from the browser clipboard`}
      >
        <Switch
          checked={props.behavior.pasteBrowserImages}
          onCheckedChange={(pasteBrowserImages) =>
            props.onChange({ pasteBrowserImages })
          }
        />
      </Row>
      <Row label="Show the git branch in tab titles">
        <Switch
          checked={props.behavior.showGitBranch}
          onCheckedChange={(showGitBranch) => props.onChange({ showGitBranch })}
        />
      </Row>
      <Row label="Capture browser shortcuts in fullscreen">
        <Switch
          checked={props.behavior.captureShortcuts}
          onCheckedChange={(captureShortcuts) =>
            props.onChange({ captureShortcuts })
          }
        />
      </Row>
    </Section>
  )
}

export function NotificationSection(props: {
  behavior: Behavior
  onChange: (value: Partial<Behavior>) => void
}) {
  return (
    <Section title="Notifications">
      <Row label="Desktop notifications on this device">
        <NotificationSwitch />
      </Row>
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

export function IdentitySection(props: {
  behavior: Behavior
  onChange: (value: Partial<Behavior>) => void
}) {
  return (
    <Section title="Terminal identity" note="Applies to new terminals">
      <Row label="Report the terminal as">
        <Select
          value={props.behavior.terminalIdentity}
          onValueChange={(terminalIdentity: TerminalIdentity) =>
            props.onChange({ terminalIdentity })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sshtty">sshtty</SelectItem>
            <SelectItem value="iterm2">iTerm2</SelectItem>
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
