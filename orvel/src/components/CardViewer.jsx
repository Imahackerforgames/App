import { useEffect, useRef, useState } from 'react'
import CardFrame from './Card.jsx'
import { Btn, Cash, RarityTag, WindowTitle } from './ui.jsx'
import { useGame, owned, useArtUrl, fmt } from '../store.jsx'
import { cardValue } from '../server/game.js'
import { ABILITIES } from '../server/battle.js'
import { StatTiles } from '../pages/Arena.jsx'
import { play } from '../lib/sound.js'

// Full-screen inspector: the card, its details, and the sell-back panel.
export default function CardViewer({ cardId, list, onClose, onNavigate }) {
  const { snap, rarityById, call } = useGame()
  const card = snap.cards.find((c) => c.id === cardId)
  const [zoom, setZoom] = useState(false)
  const [sellStage, setSellStage] = useState(null) // null | {qty, unit} | {done, total}
  const [qty, setQty] = useState(1)
  const idx = list ? list.indexOf(cardId) : -1
  const touch = useRef(null)
  function tStart(e) { if (e.touches.length === 1) touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() } }
  function tEnd(e) {
    const s = touch.current; touch.current = null
    if (!s || zoom || sellStage) return
    const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y
    if (Date.now() - s.t > 600) return
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const n = dx < 0 ? idx + 1 : idx - 1
      if (list && n >= 0 && n < list.length) { play('flip'); onNavigate(list[n]) }
    } else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5 && window.scrollY <= 0 && e.currentTarget.scrollTop <= 0) { play('back'); onClose() }
  }

  useEffect(() => { setQty(1); setSellStage(null) }, [cardId])
  useEffect(() => {
    const k = (e) => {
      if (zoom || sellStage) return
      if (e.key === 'Escape') { play('back'); onClose() }
      if (e.key === 'ArrowRight' && idx >= 0 && idx < list.length - 1) { play('hover'); onNavigate(list[idx + 1]) }
      if (e.key === 'ArrowLeft' && idx > 0) { play('hover'); onNavigate(list[idx - 1]) }
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [idx, list, zoom, sellStage, onClose, onNavigate])
  useEffect(() => { const p = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = p } }, [])

  if (!card) return null
  const rarity = rarityById[card.rarityId]
  const count = owned(snap, card.id)
  const value = cardValue(snap, card)
  const inv = snap.player.inventory[card.id]
  const themes = (card.collectionIds || []).map((id) => snap.collections.find((c) => c.id === id)).filter(Boolean)
  const cur = snap.settings.currencyName

  async function confirmSell() {
    try {
      const r = await call((s) => s.sellCard(card.id, sellStage.qty, sellStage.unit))
      play('cash')
      setSellStage({ done: true, total: r.total, qty: r.sold })
      setQty(1)
    } catch (e) {
      if (e.code === 'price_changed') { const q = await call((s) => s.quoteSale(card.id, sellStage.qty)); setSellStage({ qty: q.qty, unit: q.unit }) }
      else setSellStage(null)
    }
  }

  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`${card.name} details`} onTouchStart={tStart} onTouchEnd={tEnd}>
      <div className="viewer-back" onClick={() => { play('back'); onClose() }} />
      <button className="viewer-close" aria-label="Close" onClick={() => { play('back'); onClose() }}>✕</button>
      <div className="viewer-stage">
        <div className="viewer-card">
          <CardFrame card={card} rarity={rarity} size="xl" count={count} owned={count > 0 ? true : null} showCount={false} level={inv?.levels?.length ? Math.max(...inv.levels) : null} />
          {list && list.length > 1 && <div className="swipe-hint mono">◀ swipe ▶ · {idx + 1}/{list.length}</div>}
          <div className="viewer-card-actions">
            <Btn variant="ghost" size="sm" onClick={() => setZoom(true)}>⌕ Zoom artwork</Btn>
          </div>
        </div>
        <div className="viewer-info window">
          <WindowTitle onClose={onClose}>CARD DATA</WindowTitle>
          <div className="vi-body">
            <RarityTag rarity={rarity} />
            <h2 className="vi-name">{card.name}</h2>
            <dl className="vi-stats">
              <div><dt>CARD ID</dt><dd className="mono">{card.code}</dd></div>
              <div><dt>COLLECTION NO.</dt><dd className="mono">{String(card.collectionNumber).padStart(3, '0')}</dd></div>
              <div><dt>SELL VALUE</dt><dd><Cash amount={value} /></dd></div>

              <div><dt>OWNED</dt><dd className={count ? 'vi-owned' : 'vi-unowned'}>{count ? `${count} ${count === 1 ? 'copy' : 'copies'}` : 'Not collected'}</dd></div>
              {inv?.levels?.length > 0 && <div><dt>{inv.levels.length > 1 ? 'YOUR LEVELS' : 'LEVEL'}</dt><dd className="mono">{[...inv.levels].sort((a, b) => b - a).map((l) => 'LV ' + l).join(', ')}{inv.levels.length > 1 ? ' — your best copy fights' : ''}</dd></div>}
              {card.limited?.enabled && <div><dt>EDITION</dt><dd className="mono">{fmt(card.limited.minted)} / {fmt(card.limited.editionSize)} minted</dd></div>}
              {inv?.serials?.length > 0 && <div><dt>YOUR SERIALS</dt><dd className="mono">{inv.serials.map((n) => '#' + n).join(', ')}</dd></div>}
            </dl>
            {card.description && <p className="vi-desc">{card.description}</p>}
            {snap.cardStats?.[card.id] && (
              <div className="vi-battle">
                <div className="label">BATTLE STATS</div>
                <StatTiles stats={snap.cardStats[card.id]} />
                {snap.cardStats[card.id].abilities.map((a) => { const ab = ABILITIES.find((x) => x.id === a); return ab && <p key={a} className="fine"><b>{ab.name}</b> — {ab.text}</p> })}
              </div>
            )}
            {themes.length > 0 && <div className="vi-themes">{themes.map((t) => <span key={t.id} className="chip chip-static">{t.name}</span>)}</div>}
            {!card.published && <p className="note">This card has been retired from packs. You can still keep or sell your copies.</p>}

            <div className="sell-panel">
              <div className="sell-head">SELL BACK</div>
              {count > 0 ? (
                <>
                  <div className="sell-row">
                    <div className="stepper" aria-label="Quantity to sell">
                      <button onClick={() => { play('hover'); setQty((q) => Math.max(1, q - 1)) }} disabled={qty <= 1} aria-label="Fewer">−</button>
                      <span className="mono">{qty}</span>
                      <button onClick={() => { play('hover'); setQty((q) => Math.min(count, q + 1)) }} disabled={qty >= count} aria-label="More">+</button>
                    </div>
                    <span className="sell-total">= <Cash amount={value * qty} /></span>
                  </div>
                  <div className="sell-btns">
                    <Btn variant="sell" onClick={() => setSellStage({ qty, unit: value })}>Sell {qty > 1 ? `${qty} cards` : 'card'}</Btn>
                    {count > 1 && <Btn variant="ghost" size="sm" onClick={() => setSellStage({ qty: count - 1, unit: value })}>Sell duplicates ({count - 1})</Btn>}
                  </div>
                </>
              ) : <p className="muted">Collect this card to sell it for {cur}.</p>}
            </div>
          </div>
        </div>
      </div>

      {list && idx > 0 && <button className="viewer-nav prev" aria-label="Previous card" onClick={() => { play('hover'); onNavigate(list[idx - 1]) }}>◀</button>}
      {list && idx >= 0 && idx < list.length - 1 && <button className="viewer-nav next" aria-label="Next card" onClick={() => { play('hover'); onNavigate(list[idx + 1]) }}>▶</button>}

      {zoom && <ArtZoom card={card} onClose={() => setZoom(false)} />}

      {sellStage && !sellStage.done && (
        <div className="confirm-back">
          <div className="window confirm" role="alertdialog" aria-label="Confirm sale">
            <WindowTitle>CONFIRM SALE</WindowTitle>
            <div className="confirm-body">
              <div className="confirm-card"><CardFrame card={card} rarity={rarity} size="sm" tilt={false} showCount={false} /></div>
              <div>
                <p className="confirm-q">Sell <b>{sellStage.qty}</b> × <b>{card.name}</b>?</p>
                <dl className="vi-stats small">
                  <div><dt>RARITY</dt><dd>{rarity?.name}</dd></div>
                  <div><dt>YOU OWN</dt><dd>{count}</dd></div>
                  <div><dt>LEFT AFTER</dt><dd>{count - sellStage.qty}</dd></div>
                  <div><dt>EACH</dt><dd><Cash amount={sellStage.unit} /></dd></div>
                  <div><dt>YOU GET</dt><dd><Cash amount={sellStage.unit * sellStage.qty} big /></dd></div>
                </dl>
                <p className="fine">Sold cards are gone for good. {cur} is in-game currency only and can't be exchanged for real money.</p>
                <div className="confirm-btns">
                  <Btn variant="ghost" sound="back" onClick={() => setSellStage(null)}>Keep it</Btn>
                  <Btn variant="sell" onClick={confirmSell}>Confirm sale</Btn>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {sellStage?.done && <SoldBurst total={sellStage.total} qty={sellStage.qty} onDone={() => setSellStage(null)} />}
    </div>
  )
}

export function SoldBurst({ total, qty, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 1900); return () => clearTimeout(t) }, [onDone])
  return (
    <div className="sold" onClick={onDone} role="status">
      <div className="sold-coins">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>
      <div className="sold-stamp">SOLD!</div>
      <div className="sold-amt">+{fmt(total)}</div>
      <div className="sold-sub">{qty} card{qty === 1 ? '' : 's'} sold</div>
    </div>
  )
}

// Zoomable, pannable original artwork — no frame, no overlays, no filtering.
export function ArtZoom({ card, onClose }) {
  const url = useArtUrl(card)
  const [z, setZ] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef(null)
  const pts = useRef(new Map())

  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } if (e.key === '+' || e.key === '=') setZ((v) => Math.min(8, v * 1.25)); if (e.key === '-') setZ((v) => Math.max(1, v / 1.25)) }
    addEventListener('keydown', k, true)
    return () => removeEventListener('keydown', k, true)
  }, [onClose])
  useEffect(() => { if (z === 1) setPos({ x: 0, y: 0 }) }, [z])

  function wheel(e) { setZ((v) => Math.max(1, Math.min(8, v * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))) }
  function down(e) {
    e.currentTarget.setPointerCapture(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y, dist: null, z }
  }
  function moveP(e) {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (drag.current.dist == null) drag.current.dist = d
      setZ(Math.max(1, Math.min(8, drag.current.z * (d / drag.current.dist))))
    } else if (drag.current && z > 1) {
      setPos({ x: drag.current.px + (e.clientX - drag.current.x), y: drag.current.py + (e.clientY - drag.current.y) })
    }
  }
  function up(e) { pts.current.delete(e.pointerId); if (pts.current.size < 2 && drag.current) drag.current.dist = null }

  return (
    <div className="zoom" role="dialog" aria-label={`${card.name} artwork`}>
      <div className="zoom-canvas" onWheel={wheel} onPointerDown={down} onPointerMove={moveP} onPointerUp={up} onPointerCancel={up}
        onDoubleClick={() => setZ((v) => (v > 1 ? 1 : 2.5))} style={{ cursor: z > 1 ? 'grab' : 'zoom-in' }}>
        {url && <img src={url} alt={card.name} draggable="false" style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${z})` }} />}
      </div>
      <div className="zoom-bar window">
        <span className="zoom-name">{card.name} <span className="mono muted">{card.code}</span></span>
        <button onClick={() => setZ((v) => Math.max(1, v / 1.4))} aria-label="Zoom out">−</button>
        <span className="mono">{Math.round(z * 100)}%</span>
        <button onClick={() => setZ((v) => Math.min(8, v * 1.4))} aria-label="Zoom in">+</button>
        <button onClick={() => { setZ(1); setPos({ x: 0, y: 0 }) }}>Fit</button>
        <button onClick={() => { play('back'); onClose() }} aria-label="Close artwork">✕</button>
      </div>
    </div>
  )
}
