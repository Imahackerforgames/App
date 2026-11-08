// IndexedDB-backed storage. Game state and artwork live in separate stores so
// thousands of full-resolution images never sit in the state object.
// Artwork is stored as the original Blob — never re-encoded or downscaled.

const DB = 'orvel'
let dbp = null
function open() {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore('kv')
      req.result.createObjectStore('images')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}
function tx(store, mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const r = fn(t.objectStore(store))
    t.oncomplete = () => resolve(r?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error('Storage aborted (is the disk full?)'))
  }))
}

export const kvStorage = {
  get: (k) => tx('kv', 'readonly', (s) => s.get(k)),
  set: (k, v) => tx('kv', 'readwrite', (s) => s.put(v, k)),
}

const urlCache = new Map()
export const images = {
  async put(blob) {
    const key = 'img_' + crypto.randomUUID()
    await tx('images', 'readwrite', (s) => s.put(blob, key))
    return key
  },
  get: (key) => tx('images', 'readonly', (s) => s.get(key)),
  async url(key) {
    if (urlCache.has(key)) return urlCache.get(key)
    const blob = await images.get(key)
    if (!blob) return null
    const u = URL.createObjectURL(blob)
    urlCache.set(key, u)
    return u
  },
  async remove(key) {
    await tx('images', 'readwrite', (s) => s.delete(key))
    const u = urlCache.get(key); if (u) URL.revokeObjectURL(u); urlCache.delete(key)
  },
}

export async function wipeEverything() {
  const db = await open(); db.close(); dbp = null
  await new Promise((res) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = r.onerror = r.onblocked = () => res() })
}
