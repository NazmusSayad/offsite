export default defineEventHandler((event) => {
  const seen = getCookie(event, 'probe') === 'yes'
  setCookie(event, 'probe', 'yes', { path: '/' })
  return { message: seen ? 'hello seen' : 'hello new' }
})
