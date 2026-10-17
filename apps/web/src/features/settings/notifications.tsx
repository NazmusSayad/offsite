import { useEffect, useState } from 'react'
import { Switch } from '@/components/ui/switch'
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
import type { Prefs } from '@/lib/prefs'
import { updatePrefs } from '@/lib/store'
import { errorMessage } from '@/lib/utils'
import { Row, Section } from './controls'

const notices = new Map([
  ['denied', "Blocked in the browser's site settings"],
  ['insecure', 'Needs https or localhost'],
  ['install', 'Add OffSite to the Home Screen first'],
  ['unsupported', 'Not supported in this browser'],
])

export function NotificationsPage(props: { prefs: Prefs }) {
  const terminal = props.prefs.terminal
  const behavior = terminal.behavior

  function change(value: Partial<typeof behavior>) {
    updatePrefs({
      ...props.prefs,
      terminal: { ...terminal, behavior: { ...behavior, ...value } },
    })
  }

  return (
    <>
      <Section title="Notifications">
        <Row label="Desktop notifications on this device">
          <NotificationSwitch />
        </Row>
        <Row label="Push terminal alerts when no OffSite page is open">
          <PushSwitch />
        </Row>
      </Section>
      <Section title="Terminal bell">
        <Row label="Flash the screen on bell">
          <Switch
            checked={behavior.bellFlash}
            onCheckedChange={(bellFlash) => change({ bellFlash })}
          />
        </Row>
        <Row label="Play a sound on bell">
          <Switch
            checked={behavior.bellSound}
            onCheckedChange={(bellSound) => change({ bellSound })}
          />
        </Row>
      </Section>
    </>
  )
}

function NotificationSwitch() {
  const [permission, setPermission] = useState(notificationPermission)
  const [wanted, setWanted] = useState(notificationsWanted)

  useEffect(() => {
    const current = notificationPermission()
    if (current === 'insecure' || current === 'unsupported') {
      return
    }
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
      {notices.has(permission) && (
        <span className="text-muted-foreground text-xs">
          {notices.get(permission)}
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
    if (pushSupport() !== 'supported') {
      return
    }
    let mounted = true
    async function load() {
      try {
        const value = await pushSubscribed()
        if (mounted) {
          setSubscribed(value)
        }
      } catch (error) {
        console.error('could not read the push subscription', error)
      }
      if (mounted) {
        setBusy(false)
      }
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
      if (checked) {
        setSubscribed(await subscribePush())
      } else {
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
      {notices.has(support) && (
        <span className="text-muted-foreground text-xs">
          {notices.get(support)}
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
