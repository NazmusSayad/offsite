import type { Provider } from './providers.ts'

export const NOTICE_STATES = [
  'done',
  'asks',
  'approve',
  'not-sent',
  'push',
] as const

export type NoticeState = (typeof NOTICE_STATES)[number]

export type NoticeAction = {
  id: string
  title: string
  kind: 'open' | 'diff' | 'run'
}

export type Notice = {
  id: string
  tag: string
  title: string
  body: string
  summary: string
  source: Provider
  state: NoticeState
  image: string | null
  actions: NoticeAction[]
  whileVisible: boolean
  target: { projectId: string; sessionId: string }
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
