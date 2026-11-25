export const PAGE_STORAGE = String.raw`  const cookies = new Map()
  readCookies = function (text) {
    cookies.clear()
    for (const item of text.split('; ')) {
      const index = item.indexOf('=')
      if (index > 0) cookies.set(item.slice(0, index), item.slice(index + 1))
    }
  }
  readCookies(config.cookies)
  patch(Document.prototype, 'cookie', function () {
    return {
      get() { return Array.from(cookies, function (item) { return item[0] + '=' + item[1] }).join('; ') },
      set(value) {
        const text = String(value)
        const pair = text.split(';')[0]
        const index = pair.indexOf('=')
        const name = pair.slice(0, index).trim()
        const age = /;\s*max-age=(-?\d+)/i.exec(text)
        const expires = /;\s*expires=([^;]+)/i.exec(text)
        const gone = (age && Number(age[1]) <= 0) || (expires && Date.parse(expires[1]) <= Date.now())
        if (gone) cookies.delete(name)
        else cookies.set(name, pair.slice(index + 1).trim())
        realFetch(prefix + 'cookie', { method: 'POST', body: JSON.stringify({ url: pageUrl(), cookie: text }) })
      },
    }
  })

  function storageArea(initial, save) {
    const data = new Map(Object.entries(initial))
    const area = {
      getItem(name) { return data.has(String(name)) ? data.get(String(name)) : null },
      setItem(name, value) { data.set(String(name), String(value)); save(data) },
      removeItem(name) { data.delete(String(name)); save(data) },
      clear() { data.clear(); save(data) },
      key(index) { return Array.from(data.keys())[index] ?? null },
      get length() { return data.size },
    }
    return new Proxy(area, {
      get(target, name) {
        if (name in target) return Reflect.get(target, name)
        return typeof name === 'string' ? data.get(name) : undefined
      },
      set(target, name, value) { target.setItem(name, value); return true },
      deleteProperty(target, name) { target.removeItem(name); return true },
      has(target, name) { return name in target || data.has(name) },
      ownKeys() { return Array.from(data.keys()) },
      getOwnPropertyDescriptor(target, name) {
        return data.has(name) ? { value: data.get(name), enumerable: true, configurable: true, writable: true } : undefined
      },
    })
  }
  let saveTimer = null
  let pending = null
  function sendStorage(keepalive) {
    if (pending === null) return
    const body = JSON.stringify({ origin: new URL(pageUrl()).origin, data: pending })
    pending = null
    realFetch(prefix + 'storage', { method: 'POST', body, keepalive: keepalive && body.length < 60000 })
  }
  const local = storageArea(config.storage, function (data) {
    pending = Object.fromEntries(data)
    clearTimeout(saveTimer)
    saveTimer = setTimeout(function () { sendStorage(false) }, 50)
  })
  const session = storageArea({}, function () {})
  Object.defineProperty(window, 'localStorage', { get() { return local }, configurable: true })
  Object.defineProperty(window, 'sessionStorage', { get() { return session }, configurable: true })
  addEventListener('pagehide', function () { sendStorage(true) })`
