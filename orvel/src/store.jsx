import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createGameServer, rankFor } from './server/game.js'
import { kvStorage, images } from './lib/storage.js'
import { seedCards } from './lib/seedArt.js'
import { play } from './lib/sound.js'

// One server per page load. In production this object is replaced by an
// HTTP client with the same method names (see docs/PRODUCTION.md).
export const server = createGameServer(kvStorage)

const Ctx = createContext(null)

export function GameProvider({ children }) {
  const [snap, setSnap] = useState(null)
  const [toasts, setToasts] = useState([])
  const [bootError, setBootError] = useState(null)
  const [adminToken, setAdminToken] = useState(null)

  const refresh = useCallback(async () => { const s = await server.snapshot(); setSnap(s); return s }, [])

  useEffect(() => {
    (async () => {
      try {
        await server._seedIfEmpty(seedCards())
        await refresh()
      } catch (e) { setBootError(e) }
    })()
  }, [refresh])

  const toast = useCallback((msg, kind = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, msg, kind }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 5000 : 3200)
  }, [])

  // Run a server call, refresh the snapshot, surface errors as toasts.
  const call = useCallback(async (fn, { quiet = false } = {}) => {
    try {
      const r = await fn(server)
      await refresh()
      return r
    } catch (e) {
      if (!quiet) { play('error'); toast(e.message || 'Something went wrong', 'error') }
      throw e
    }
  }, [refresh, toast])

  const derived = useMemo(() => {
    if (!snap) return null
    const rarityById = Object.fromEntries(snap.rarities.map((r, i) => [r.id, { ...r, tier: i }]))
    const published = snap.cards.filter((c) => c.published)
    const ownedUnique = published.filter((c) => (snap.player.inventory[c.id]?.count || 0) > 0).length
    const totalCopies = Object.values(snap.player.inventory).reduce((t, i) => t + i.count, 0)
    return {
      rarityById,
      rank: rankFor(snap.ranks, snap.player.xp),
      completion: { owned: ownedUnique, total: published.length, pct: published.length ? ownedUnique / published.length : 0 },
      totalCopies,
    }
  }, [snap])

  const value = { snap, ...derived, refresh, call, toast, toasts, adminToken, setAdminToken, bootError }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useGame = () => useContext(Ctx)

export function owned(snap, cardId) { return snap.player.inventory[cardId]?.count || 0 }

// Resolves a card's artwork to a URL: either a static URL or an uploaded
// original from IndexedDB.
export function useArtUrl(card) {
  const [url, setUrl] = useState(card?.imageUrl || null)
  const key = card?.imageKey
  useEffect(() => {
    let live = true
    if (card?.imageUrl) setUrl(card.imageUrl)
    else if (key) images.url(key).then((u) => live && setUrl(u))
    else setUrl(null)
    return () => { live = false }
  }, [key, card?.imageUrl])
  return url
}

export function useHashRoute() {
  const get = () => (location.hash.replace(/^#\/?/, '') || 'home').split(/[?/]/)[0]
  const [route, setRoute] = useState(get)
  useEffect(() => { const f = () => setRoute(get()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return route
}
export const go = (r) => { location.hash = r }

export function fmt(n) { return Number(n || 0).toLocaleString() }

export function useLatest(v) { const r = useRef(v); r.current = v; return r }
