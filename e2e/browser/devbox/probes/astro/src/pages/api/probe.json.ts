import type { APIRoute } from 'astro'

export const prerender = false

export const GET: APIRoute = (context) => {
  const seen = context.cookies.get('probe')?.value === 'yes'
  context.cookies.set('probe', 'yes', { path: '/' })
  return Response.json({ message: seen ? 'hello seen' : 'hello new' })
}
