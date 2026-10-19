import {
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { z } from 'zod'
import { App } from '@/app'

const searchSchema = z.object({
  machine: z.string().optional().catch(undefined),
  project: z.string().optional().catch(undefined),
  session: z.string().optional().catch(undefined),
  panel: z.enum(['diff', 'tasks', 'files']).optional().catch(undefined),
  bottom: z.literal('terminal').optional().catch(undefined),
  terminal: z.string().optional().catch(undefined),
})

export type Search = z.infer<typeof searchSchema>

const rootRoute = createRootRoute({
  validateSearch: searchSchema,
  component: App,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute]),
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
    layer?: 'chat' | 'overlay'
  }
}
