export const PAGE_DATABASES = String.raw`  const databaseNames = ['indexedDB', 'IDBCursor', 'IDBCursorWithValue', 'IDBDatabase', 'IDBFactory', 'IDBIndex', 'IDBKeyRange', 'IDBObjectStore', 'IDBOpenDBRequest', 'IDBRecord', 'IDBRequest', 'IDBTransaction', 'IDBVersionChangeEvent']
  let databases = null
  function loadDatabases() {
    if (databases === null) {
      const request = new XMLHttpRequest()
      realOpen.call(request, 'GET', origin + prefix + 'indexeddb.js', false)
      request.send()
      if (request.status !== 200) throw new DOMException('IndexedDB could not load', 'UnknownError')
      databases = new Function(request.responseText)()
    }
    return databases
  }
  for (const name of databaseNames) {
    Object.defineProperty(window, name, {
      configurable: true,
      get() {
        const value = loadDatabases()[name]
        Object.defineProperty(window, name, { value, configurable: true, writable: true })
        return value
      },
      set(value) { Object.defineProperty(window, name, { value, configurable: true, writable: true }) },
    })
  }

  function memoryCache() {
    const entries = new Map()
    function key(request) { return new Request(request).url }
    return {
      match(request) {
        const found = entries.get(key(request))
        return Promise.resolve(found === undefined ? undefined : found.clone())
      },
      matchAll(request) {
        const found = request === undefined ? Array.from(entries.values()) : [entries.get(key(request))].filter(Boolean)
        return Promise.resolve(found.map(function (item) { return item.clone() }))
      },
      put(request, response) {
        entries.set(key(request), response.clone())
        return Promise.resolve()
      },
      async add(request) {
        const response = await fetch(request)
        if (!response.ok) throw new TypeError('Cache.add got status ' + response.status)
        entries.set(key(request), response)
      },
      async addAll(requests) {
        for (const request of requests) await this.add(request)
      },
      delete(request) { return Promise.resolve(entries.delete(key(request))) },
      keys() { return Promise.resolve(Array.from(entries.keys(), function (url) { return new Request(url) })) },
    }
  }
  const cacheStores = new Map()
  Object.defineProperty(window, 'caches', {
    configurable: true,
    value: {
      open(name) {
        if (!cacheStores.has(name)) cacheStores.set(name, memoryCache())
        return Promise.resolve(cacheStores.get(name))
      },
      has(name) { return Promise.resolve(cacheStores.has(name)) },
      delete(name) { return Promise.resolve(cacheStores.delete(name)) },
      keys() { return Promise.resolve(Array.from(cacheStores.keys())) },
      async match(request) {
        for (const cache of cacheStores.values()) {
          const found = await cache.match(request)
          if (found !== undefined) return found
        }
        return undefined
      },
    },
  })`
