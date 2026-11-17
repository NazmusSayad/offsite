export function loader(args: { request: Request }) {
  const seen =
    args.request.headers.get('cookie')?.includes('probe=yes') === true
  return Response.json(
    { message: seen ? 'hello seen' : 'hello new' },
    { headers: { 'set-cookie': 'probe=yes; Path=/' } }
  )
}
