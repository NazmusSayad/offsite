let opened: Promise<IDBDatabase> | undefined

export function readToken(machine: string) {
  return run<string | undefined>('readonly', (store) => store.get(machine))
}

export function saveToken(machine: string, token: string) {
  return run('readwrite', (store) => store.put(token, machine))
}

export function removeToken(machine: string) {
  return run('readwrite', (store) => store.delete(machine))
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest
) {
  opened ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('offsite', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('tokens')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  const database = await opened
  return await new Promise<T>((resolve, reject) => {
    const request = action(
      database.transaction('tokens', mode).objectStore('tokens')
    )
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
