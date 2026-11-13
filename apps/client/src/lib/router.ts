import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router'
import { z } from 'zod'
import { lastTerminalMachine } from '@/lib/sessions'

const searchSchema = z.object({
  machine: z.string().optional().catch(undefined),
  project: z.string().optional().catch(undefined),
  session: z.string().optional().catch(undefined),
  panel: z
    .enum(['diff', 'pulls', 'tasks', 'browser'])
    .optional()
    .catch(undefined),
  browse: z.string().optional().catch(undefined),
  pull: z.string().optional().catch(undefined),
  bottom: z.literal('terminal').optional().catch(undefined),
  terminal: z.string().optional().catch(undefined),
})

export type Search = z.infer<typeof searchSchema>

const rootRoute = createRootRoute({
  validateSearch: searchSchema,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})

const lastTerminalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terminal',
  beforeLoad: () => {
    const machine = lastTerminalMachine()
    if (machine === null) {
      throw redirect({ to: '/', search: {}, replace: true })
    }
    throw redirect({
      to: '/terminal/$machine',
      params: { machine },
      search: {},
      replace: true,
    })
  },
})

const terminalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/terminal/$machine',
})

const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/activity',
})

const opened = window.history.state as { __TSR_index?: number } | null
if (
  opened?.__TSR_index === undefined &&
  (location.pathname.startsWith('/terminal') ||
    location.pathname === '/activity' ||
    new URLSearchParams(location.search).has('machine'))
) {
  const href = `${location.pathname}${location.search}${location.hash}`
  const base = Math.random().toString(36).slice(2)
  const top = Math.random().toString(36).slice(2)
  window.history.replaceState(
    { __TSR_index: 0, __TSR_key: base, key: base },
    '',
    '/'
  )
  window.history.pushState(
    { __TSR_index: 1, __TSR_key: top, key: top },
    '',
    href
  )
}

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    indexRoute,
    lastTerminalRoute,
    terminalRoute,
    activityRoute,
  ]),
  disableGlobalCatchBoundary: true,
  parseSearch: (value) =>
    searchSchema.parse(Object.fromEntries(new URLSearchParams(value))),
  stringifySearch: (search) => {
    const params = new URLSearchParams()
    for (const entry of Object.entries(search)) {
      if (entry[1] !== undefined) {
        params.set(entry[0], String(entry[1]))
      }
    }
    const value = params.toString()
    return value === '' ? '' : `?${value}`
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
  interface HistoryState {
    layer?: 'overlay'
    guard?: true
  }
}
