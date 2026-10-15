import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  type ClipboardRead,
  type Config,
  type Platform,
  removeBackground,
  shellIntegrationIssue,
  type TerminalIdentity,
  uploadBackground,
} from '@/config'
import {
  notificationPermission,
  notificationsWanted,
  pushSubscribed,
  pushSupport,
  setNotificationsWanted,
  subscribePush,
  unsubscribePush,
  watchPermission,
} from '@/notifications'
import { imagePasteKeys } from '@/paste'
import { Row, Section } from '@/settings-layout'

type Behavior = Config['behavior']

const isMac = navigator.userAgent.includes('Mac')

export function BehaviorSection(props: {
  behavior: Behavior
  platform: Platform
  shellCommand: string | null
  defaultShell: string
  onChange: (value: Partial<Behavior>) => void
}) {
  const shellIssue = shellIntegrationIssue(
    props.shellCommand,
    props.platform,
    props.defaultShell
  )
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
      <Row label="Capture browser shortcuts">
        <Switch
          checked={props.behavior.captureShortcuts}
          onCheckedChange={(captureShortcuts) =>
            props.onChange({ captureShortcuts })
          }
        />
      </Row>
      <Row label="Mark prompts and commands (shell integration)">
        <div className="flex items-center gap-3">
          {shellIssue !== null && (
            <span className="text-muted-foreground max-w-32 text-right text-xs sm:max-w-none">
              {shellIssue}
            </span>
          )}
          <Switch
            checked={shellIssue === null && props.behavior.shellIntegration}
            disabled={shellIssue !== null}
            onCheckedChange={(shellIntegration) =>
              props.onChange({ shellIntegration })
            }
          />
        </div>
      </Row>
      <Row
        label={`Mark commands on the scroll bar, ${isMac ? 'Cmd+Up/Down' : 'Ctrl+Shift+Up/Down'} jumps between them`}
      >
        <Switch
          checked={props.behavior.commandMarks}
          onCheckedChange={(commandMarks) => props.onChange({ commandMarks })}
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
      <Row label="Let programs read the clipboard">
        <Select
          value={props.behavior.clipboardRead}
          onValueChange={(clipboardRead: ClipboardRead) =>
            props.onChange({ clipboardRead })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ask">Ask each time</SelectItem>
            <SelectItem value="allow">Allow</SelectItem>
            <SelectItem value="deny">Deny</SelectItem>
          </SelectContent>
        </Select>
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

export function NotificationSection(props: {
  behavior: Behavior
  onChange: (value: Partial<Behavior>) => void
}) {
  return (
    <Section title="Notifications">
      <Row label="Desktop notifications on this device">
        <NotificationSwitch />
      </Row>
      <Row label="Push notifications when no sshtty page is open">
        <PushSwitch />
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
            <SelectItem value="ghostty">Ghostty</SelectItem>
            <SelectItem value="iterm2">iTerm2</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </Section>
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

export function BackgroundSection(props: {
  behavior: Behavior
  onChange: (value: Partial<Behavior>) => void
  onError: (message: string) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState(props.behavior.backgroundImage)

  async function upload(file: File) {
    try {
      setImage(await uploadBackground(file))
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error))
    }
  }

  async function remove() {
    try {
      await removeBackground()
      setImage(null)
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <Section
      title="Background image"
      note="A group can set its own from its menu"
    >
      <Row label="Image for all groups">
        <div className="flex items-center gap-2">
          {image !== null && (
            <img
              src={`/api/backgrounds/${image}`}
              alt=""
              className="h-7 w-11 rounded-md border object-cover"
            />
          )}
          <Button
            variant="outline"
            size="sm"
            aria-label={
              image === null
                ? 'Choose image for all groups'
                : 'Change image for all groups'
            }
            onClick={() => input.current?.click()}
          >
            {image === null ? 'Choose…' : 'Change…'}
          </Button>
          {image !== null && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => void remove()}
            >
              Remove
            </Button>
          )}
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file !== undefined) void upload(file)
            }}
          />
        </div>
      </Row>
      <Row label="Opacity">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            className="accent-primary w-40"
            value={props.behavior.backgroundOpacity}
            onChange={(event) =>
              props.onChange({ backgroundOpacity: Number(event.target.value) })
            }
          />
          <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
            {Math.round(props.behavior.backgroundOpacity * 100)}%
          </span>
        </div>
      </Row>
      <Row label="Fit">
        <Select
          value={props.behavior.backgroundFit}
          onValueChange={(backgroundFit: Behavior['backgroundFit']) =>
            props.onChange({ backgroundFit })
          }
        >
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Cover</SelectItem>
            <SelectItem value="contain">Contain</SelectItem>
            <SelectItem value="tile">Tile</SelectItem>
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
      setFailure(error instanceof Error ? error.message : String(error))
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
      {support === 'insecure' && (
        <span className="text-muted-foreground text-xs">
          Needs https or localhost
        </span>
      )}
      {support === 'install' && (
        <span className="text-muted-foreground text-xs">
          Add sshtty to the Home Screen first
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
