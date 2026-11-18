import { type RouteConfig, index, route } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('probe', 'routes/probe.tsx'),
  route('api/probe', 'routes/api-probe.ts'),
] satisfies RouteConfig
