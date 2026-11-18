import type { Provider } from './providers.ts'

export const NOTIFICATION_STATES = [
  'done',
  'asks',
  'approve',
  'not-sent',
  'push',
] as const

export type NotificationState = (typeof NOTIFICATION_STATES)[number]

export type NotificationAction = {
  id: string
  title: string
  kind: 'open' | 'run'
}

export type PushNotification = {
  id: string
  tag: string
  title: string
  body: string
  summary: string
  source: Provider
  state: NotificationState
  image: string | null
  icon: string | null
  actions: NotificationAction[]
  whileVisible: boolean
  target: { projectId: string; worktreeId: string | null; sessionId: string }
}

export type PushSubscriptionInfo = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export type PushRegistration = {
  subscription: PushSubscriptionInfo
  publicKey: string
  privateKey: string
  machine: string
}

export type NotificationMethods = {
  'push.subscribe': { params: PushRegistration; result: null }
  'push.unsubscribe': { params: { endpoint: string }; result: null }
  'notifications.awake': {
    params: { id: string; browser: string }
    result: null
  }
  'notifications.act': {
    params: { id: string; action: string }
    result: null
  }
  'notifications.seen': { params: { sessionId: string }; result: null }
  'notifications.dismissed': { params: { ids: string[] }; result: string[] }
}
