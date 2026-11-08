import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import CardFrame from '../components/Card.jsx'
import CardViewer, { SoldBurst } from '../components/CardViewer.jsx'
import { Btn, Cash, Meter, Modal, RarityTag, WindowTitle } from '../components/ui.jsx'
import { useGame, fmt } from '../store.jsx'
import { play } from '../lib/sound.js'

const PAGE = 48
const SORTS = [
  ['number', 'Collection No.'],
  ['name', 'Name A → Z'],
  ['name-desc', 'Name Z → A'],
  ['rarity-desc', 'Rarity: rarest first'],
  ['rarity', 'Rarity: common first'],
  ['copies', 'Most copies'],
]

// Builds the search index once per catalog change, so typing only scans
// precomputed lowercase strings — fast at thousands of cards.
function useIndex(cards, rarityById, inventory) {
  return useMemo(() => cards.map((c) => ({
    card: c,
    hay: `${c.name}\u0000${c.code}`.toLowerCase(),
    name: c.name.toLowerCase(),
    tier: rarityById[c.rarityId]?.tier ?? 0,
    count: inventory[c.id]?.count || 0,
  })), [cards, rarityById, inventory])
}

export function searchCards(index, { q, rarities, own, theme, sort }) {
  const query = q.trim().toLowerCase()
  const terms = query.split(/\s+/).filter(Boolean)
  // "12", "#12", "no.12" → collection number; "orv-12" / "orv-0012" → card ID
  const numMatch = query.match(/^(?:#|no\.?\s*)?(\d+)$/)
  const idMatch = query.match(/^orv-?(\d+)$/)
  const num = numMatch ? Number(numMatch[1]) : null
  const out = index.filter((e) => {
    if (rarities.size && !rarities.has(e.card.rarityId)) return false
    if (own === 'owned' && !e.count) return false
    if (own === 'unowned' && e.count) return false
    if (own === 'dupes' && e.count < 2) return false
    if (theme && !(e.card.collectionIds || []).includes(theme)) return false
    if (!terms.length) return true
    if (idMatch) return Number(e.card.code.slice(4)) === Number(idMatch[1]) || e.hay.includes(query)
    if (num != null && e.card.collectionNumber === num) return true
    return terms.every((t) => e.hay.includes(t))
  })
  const cmp = {
    number: (a, b) => a.card.collectionNumber - b.card.collectionNumber,
    name: (a, b) => a.name.localeCompare(b.name),
    'name-desc': (a, b) => b.name.localeCompare(a.name),
    'rarity-desc': (a, b) => b.tier - a.tier || a.card.collectionNumber - b.card.collectionNumber,
    rarity: (a, b) => a.tier - b.tier || a.card.collectionNumber - b.card.collectionNumber,
    copies: (a, b) => b.count - a.count || a.card.collectionNumber - b.card.collectionNumber,
  }[sort]
  return out.sort(cmp)
}

function readParams() {
  try { return JSON.parse(sessionStorage.getItem('orvel:colfilters') || '{}') } catch { return {} }
}

export default function Collection() {
  const { snap, rarityById, completion } = useGame()
  const saved = useMemo(readParams, [])
  const [q, setQ] = useState(saved.q || '')
  const [rarities, setRarities] = useState(() => new Set(saved.rarities || []))
  const [own, setOwn] = useState(saved.own || 'all')
  const [theme, setTheme] = useState(saved.theme || '')
  const [sort, setSort] = useState(saved.sort || 'number')
  const [limit, setLimit] = useState(PAGE)
  const [open, setOpen] = useState(null)
  const [bulk, setBulk] = useState(false)
  const dq = useDeferredValue(q)
  const sentinel = useRef(null)
  const searchRef = useRef(null)

  useEffect(() => {
    try { sessionStorage.setItem('orvel:colfilters', JSON.stringify({ q, rarities: [...rarities], own, theme, sort })) } catch {}
  }, [q, rarities, own, theme, sort])

  const catalog = useMemo(() => snap.cards.filter((c) => c.published || snap.player.inventory[c.id]?.count), [snap.cards, snap.player.inventory])
  const index = useIndex(catalog, rarityById, snap.player.inventory)
  const results = useMemo(() => searchCards(index, { q: dq, rarities, own, theme, sort }), [index, dq, rarities, own, theme, sort])
  const ids = useMemo(() => results.map((r) => r.card.id), [results])

  useEffect(() => setLimit(PAGE), [dq, rarities, own, theme, sort])
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) setLimit((l) => l + PAGE) }, { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [results.length])
  useEffect(() => {
    const k = (e) => { if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && !open) { e.preventDefault(); searchRef.current?.focus() } }
    addEventListener('keydown', k); return () => removeEventListener('keydown', k)
  }, [open])

  const toggleRarity = (id) => { play('hover'); setRarities((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  const clear = () => { play('back'); setQ(''); setRarities(new Set()); setOwn('all'); setTheme('') }
  const filtered = q || rarities.size || own !== 'all' || theme
  const dupes = Object.values(snap.player.inventory).reduce((t, i) => t + Math.max(0, i.count - 1), 0)
  const onNavigate = useCallback((id) => setOpen(id), [])
  const onClose = useCallback(() => setOpen(null), [])

  const perRarity = useMemo(() => snap.rarities.map((r) => {
    const all = catalog.filter((c) => c.rarityId === r.id && c.published)
    return { r, total: all.length, owned: all.filter((c) => snap.player.inventory[c.id]?.count).length }
  }), [snap.rarities, catalog, snap.player.inventory])

  return (
    <div className="page collection">
      <header className="page-head">
        <h1 className="page-title"><span className="pt-icon">▣</span> COLLECTION</h1>
        <div className="completion window">
          <div className="comp-top">
            <span className="label">COMPLETION</span>
            <span className="mono comp-n">{completion.owned} / {completion.total}</span>
            <span className="mono comp-pct">{Math.floor(completion.pct * 100)}%</span>
          </div>
          <Meter value={completion.pct} label="Collection completion" />
          <div className="comp-rarities">
            {perRarity.filter((x) => x.total).map(({ r, total, owned }) => (
              <span key={r.id} className="comp-r" style={{ '--c1': r.color }} title={`${r.name}: ${owned} of ${total}`}>
                <i />{owned}/{total}
              </span>
            ))}
          </div>
        </div>
      </header>

      <div className="toolbar window">
        <div className="search">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input ref={searchRef} type="search" placeholder="Search by card name or ID…  ( / )" value={q}
            onChange={(e) => setQ(e.target.value)} aria-label="Search cards by name or ID" autoComplete="off" spellCheck="false" />
          {q && <button className="search-clear" onClick={() => setQ('')} aria-label="Clear search">✕</button>}
        </div>
        <div className="filters">
          <div className="chips" role="group" aria-label="Filter by rarity">
            {snap.rarities.map((r) => (
              <button key={r.id} className={`chip ${rarities.has(r.id) ? 'on' : ''}`} style={{ '--c1': r.color }} onClick={() => toggleRarity(r.id)} aria-pressed={rarities.has(r.id)}>
                <i />{r.name}
              </button>
            ))}
          </div>
          <div className="filter-row">
            <div className="seg" role="group" aria-label="Ownership">
              {[['all', 'All'], ['owned', 'Owned'], ['unowned', 'Missing'], ['dupes', 'Duplicates']].map(([v, l]) => (
                <button key={v} className={own === v ? 'on' : ''} onClick={() => { play('hover'); setOwn(v) }} aria-pressed={own === v}>{l}</button>
              ))}
            </div>
            {snap.collections.length > 0 && (
              <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Themed collection">
                <option value="">All themes</option>
                {snap.collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {dupes > 0 && <Btn variant="sell" size="sm" onClick={() => setBulk(true)}>Sell duplicates ({dupes})</Btn>}
          </div>
        </div>
        <div className="result-line mono" aria-live="polite">
          {fmt(results.length)} {results.length === 1 ? 'card' : 'cards'}{filtered ? ` matching` : ' in the catalog'}
          {filtered && <button className="link" onClick={clear}>clear filters</button>}
        </div>
      </div>

      {theme && <ThemeBanner col={snap.collections.find((c) => c.id === theme)} />}

      {results.length === 0 ? (
        <div className="empty window">
          <div className="empty-icon">?</div>
          {catalog.length === 0 ? (
            <><h3>NO CARDS YET</h3><p>The catalog is empty. New artwork is on its way.</p></>
          ) : (
            <>
              <h3>NO MATCH</h3>
              <p>{q ? <>No cards match <b>"{q}"</b></> : 'No cards match these filters'}{own === 'owned' ? ' in your collection' : ''}.</p>
              <p className="muted">Try part of a name (like "mid"), a card ID like <span className="mono">ORV-0012</span>, or a collection number like <span className="mono">#12</span>.</p>
              <Btn variant="ghost" onClick={clear}>Clear search & filters</Btn>
            </>
          )}
        </div>
      ) : (
        <div className="grid">
          {results.slice(0, limit).map(({ card, count }) => (
            <CardFrame key={card.id} card={card} rarity={rarityById[card.rarityId]} owned={count > 0 ? true : false} count={count}
              onClick={() => { play('click'); setOpen(card.id) }} />
          ))}
        </div>
      )}
      {limit < results.length && <div ref={sentinel} className="sentinel mono">LOADING…</div>}

      {open && <CardViewer cardId={open} list={ids} onClose={onClose} onNavigate={onNavigate} />}
      {bulk && <BulkSell onClose={() => setBulk(false)} />}
    </div>
  )
}

function ThemeBanner({ col }) {
  if (!col) return null
  return <div className="theme-banner"><b>{col.name}</b>{col.description && <span> — {col.description}</span>}</div>
}

export function BulkSell({ onClose }) {
  const { snap, rarityById, call } = useGame()
  const [quote, setQuote] = useState(null)
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { call((s) => s.quoteDuplicates()).then(setQuote).catch(onClose) }, [])

  async function confirm() {
    setBusy(true)
    try {
      const r = await call((s) => s.sellDuplicates(quote.total))
      play('cash'); setDone(r)
    } catch (e) {
      if (e.code === 'price_changed') setQuote(await call((s) => s.quoteDuplicates()))
    } finally { setBusy(false) }
  }
  if (done) return <SoldBurst total={done.total} qty={done.sold} onDone={onClose} />
  return (
    <Modal onClose={onClose} label="Sell duplicates">
      <WindowTitle onClose={onClose}>SELL DUPLICATES</WindowTitle>
      <div className="modal-body">
        {!quote ? <p className="mono">CALCULATING…</p> : (
          <>
            <p>Sell every extra copy and keep one of each card. Nothing you own only once is touched.</p>
            <div className="bulk-list">
              {quote.lines.sort((a, b) => (rarityById[b.rarityId]?.tier ?? 0) - (rarityById[a.rarityId]?.tier ?? 0)).map((l) => (
                <div key={l.cardId} className="bulk-row">
                  <RarityTag rarity={rarityById[l.rarityId]} />
                  <span className="bulk-name">{l.name}</span>
                  <span className="mono">×{l.qty}</span>
                  <Cash amount={l.qty * l.unit} />
                </div>
              ))}
            </div>
            <div className="bulk-total"><span>{quote.count} cards</span><Cash amount={quote.total} big /></div>
            <p className="fine">{snap.settings.currencyName} is in-game currency only and can't be exchanged for real money. Sold cards can't be recovered.</p>
            <div className="confirm-btns">
              <Btn variant="ghost" sound="back" onClick={onClose}>Cancel</Btn>
              <Btn variant="sell" onClick={confirm} disabled={busy || !quote.count}>Sell {quote.count} cards</Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
