export type PushMessage =
  | {
      kind: 'terminal'
      title: string
      body: string
      projectId: string
      tabId: number
    }
  | {
      kind: 'session'
      title: string
      body: string
      projectId: string
      sessionId: string
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
