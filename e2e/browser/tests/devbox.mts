type State = {
  state: 'starting' | 'ready' | 'failed'
  url: string
  error: string
  log: string[]
}

export type Status = {
  version: string
  done: boolean
  states: Record<string, State>
}

async function call(path: string, method: 'GET' | 'POST') {
  const response = await fetch(`http://devbox:9999${path}`, { method })
  if (!response.ok) {
    throw new Error(
      `devbox ${path} answered ${response.status}: ${await response.text()}`
    )
  }
  return response
}

export async function devboxStatus() {
  const status: Status = await (await call('/status', 'GET')).json()
  return status
}

export async function pairCode() {
  const pair: { code: string } = await (await call('/pair', 'GET')).json()
  return pair.code
}

export async function editProbe(app: string, to: 'edited' | 'original') {
  await call(`/edit?app=${app}&to=${to}`, 'POST')
}
