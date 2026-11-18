import { useEffect, useState } from 'react'
import { Link } from 'react-router'

export default function Probe() {
  const [count, setCount] = useState(0)
  const [where, setWhere] = useState('')
  const [api, setApi] = useState('')
  const [cookie, setCookie] = useState('')

  useEffect(() => setWhere(location.href), [])

  async function callApi() {
    const response = await fetch('/api/probe')
    const data = await response.json()
    setApi(data.message)
    setCookie(document.cookie.includes('probe=yes') ? 'yes' : 'no')
  }

  return (
    <main>
      <h1 id="probe-title">Probe original</h1>
      <p id="location">{where}</p>
      <button id="count" onClick={() => setCount(count + 1)}>
        count {count}
      </button>
      <button id="api" onClick={callApi}>
        api
      </button>
      <p id="api-result">{api}</p>
      <p id="cookie">{cookie}</p>
      <Link id="other" to="/">
        other
      </Link>
    </main>
  )
}
