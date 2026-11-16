import type { Notice, NoticeState } from '@offsite/core/push'
import { beforeEach, describe, expect, it } from 'vitest'
import { showNotice } from './notices'

type Shown = {
  title: string
  tag: string
  body: string
  icon: string
  image: string | undefined
  data: unknown
  close: () => void
}

let shown: Shown[] = []

const registration = {
  getNotifications: async () => [...shown],
  showNotification: async (
    title: string,
    options: NotificationOptions & { image?: string }
  ) => {
    shown = shown.filter((item) => item.tag !== options.tag)
    const item: Shown = {
      title,
      tag: options.tag ?? '',
      body: options.body ?? '',
      icon: options.icon ?? '',
      image: options.image,
      data: options.data,
      close: () => {
        shown = shown.filter((other) => other !== item)
      },
    }
    shown.push(item)
  },
} as unknown as ServiceWorkerRegistration

function notice(session: string, state: NoticeState = 'done'): Notice {
  return {
    id: `${session}-${state}`,
    tag: `session:${session}`,
    title: `Title ${session}`,
    body: `Body ${session}`,
    summary: `summary ${session}`,
    source: 'claude',
    state,
    image: null,
    actions: [],
    whileVisible: false,
    target: { projectId: 'project', worktreeId: null, sessionId: session },
  }
}

function show(item: Notice, address: string | null = null) {
  return showNotice(registration, 'machine', item, address)
}

beforeEach(() => {
  shown = []
})

describe('showing notifications', () => {
  it('shows one conversation on its own', async () => {
    await show(notice('a'))

    expect(shown).toEqual([
      expect.objectContaining({
        title: 'Title a',
        tag: 'session:a',
        body: 'Body a',
        icon: '/notification-icons/claude-done.png',
      }),
    ])
  })

  it('replaces the notification of the same conversation', async () => {
    await show(notice('a'))
    await show({ ...notice('a', 'asks'), title: 'Newer a' })

    expect(shown.map((item) => item.title)).toEqual(['Newer a'])
  })

  it('shows two conversations side by side', async () => {
    await show(notice('a'))
    await show(notice('b'))

    expect(shown.map((item) => item.title)).toEqual(['Title a', 'Title b'])
  })

  it('collapses three conversations into one summary', async () => {
    await show(notice('a'))
    await show(notice('b'))
    await show(notice('c'))

    expect(shown).toEqual([
      expect.objectContaining({
        title: 'While you were away',
        tag: 'digest',
        body: [
          '✓ Title c — summary c',
          '✓ Title a — summary a',
          '✓ Title b — summary b',
        ].join('\n'),
      }),
    ])
  })

  it('leads the summary with the conversation that needs you most', async () => {
    await show(notice('a'))
    await show(notice('b', 'asks'))
    await show(notice('c', 'not-sent'))

    expect(shown[0].icon).toBe('/notification-icons/claude-asks.png')
    expect(shown[0].data).toEqual(
      expect.objectContaining({ notice: notice('b', 'asks') })
    )
  })

  it('adds later conversations to the summary', async () => {
    await show(notice('a'))
    await show(notice('b'))
    await show(notice('c'))
    await show(notice('d'))

    expect(shown).toHaveLength(1)
    expect(shown[0].body.split('\n')).toHaveLength(4)
  })

  it('updates a conversation already in the summary instead of listing it twice', async () => {
    await show(notice('a'))
    await show(notice('b'))
    await show(notice('c'))
    await show({ ...notice('b', 'asks'), title: 'Newer b' })

    expect(shown).toHaveLength(1)
    expect(shown[0].body).toBe(
      [
        '? Newer b — summary b',
        '✓ Title c — summary c',
        '✓ Title a — summary a',
      ].join('\n')
    )
  })

  it('loads the image from the machine address', async () => {
    await show({ ...notice('a'), image: '/api/notice-image/picture' })
    await show(
      { ...notice('b'), image: '/api/notice-image/picture' },
      'https://of.example'
    )

    expect(shown.map((item) => item.image)).toEqual([
      undefined,
      'https://of.example/api/notice-image/picture',
    ])
  })
})
