import type { RequestHandler } from './$types'

export const GET: RequestHandler = (event) => {
  const seen = event.cookies.get('probe') === 'yes'
  event.cookies.set('probe', 'yes', {
    path: '/',
    httpOnly: false,
    secure: false,
  })
  return Response.json({ message: seen ? 'hello seen' : 'hello new' })
}
