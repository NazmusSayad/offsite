export function GET(request: Request) {
  const seen = request.headers.get('cookie')?.includes('probe=yes') === true
  return Response.json(
    { message: seen ? 'hello seen' : 'hello new' },
    { headers: { 'set-cookie': 'probe=yes; Path=/' } }
  )
}
