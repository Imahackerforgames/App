import { memo, useEffect, useRef, useState } from 'react'
import Fighter from './Fighter.jsx'
import { cardStats } from '../server/battle.js'
import { useArtUrl } from '../store.jsx'

// The collectible frame. Artwork is never resampled or cropped by default:
// it sits `contain`-fitted over a soft blurred copy of itself, so any aspect
// ratio fills the window without distortion. Admins can opt a card into
// `cover` when they prefer edge-to-edge.
function CardFrame({ card, rarity, owned = null, count = 0, size = 'md', tilt = true, onClick, showCount = true, revealing = false, serial = null, frame = null, footRight = null, stats = null, level = null }) {
  const lv = level ?? stats?.level ?? null
  const url = useArtUrl(card)
  const ref = useRef(null)
  const effect = rarity?.effect || 'matte'

  function move(e) {
    if (!tilt || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    ref.current.style.setProperty('--rx', `${(0.5 - y) * 14}deg`)
    ref.current.style.setProperty('--ry', `${(x - 0.5) * 18}deg`)
    ref.current.style.setProperty('--mx', `${x * 100}%`)
    ref.current.style.setProperty('--my', `${y * 100}%`)
  }
  function leave() {
    if (!ref.current) return
    ref.current.style.setProperty('--rx', '0deg'); ref.current.style.setProperty('--ry', '0deg')
  }
  const locked = owned === false
  return (
    <div
      ref={ref}
      className={`card card-${size} fx-${effect} ${frame ? 'frame-' + frame : ''} ${locked ? 'card-locked' : ''} ${onClick ? 'card-click' : ''} ${revealing ? 'card-revealing' : ''}`}
      style={{ '--c1': rarity?.color || '#999', '--c2': rarity?.color2 || '#333' }}
      onPointerMove={move} onPointerLeave={leave}
      onClick={onClick} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      aria-label={onClick ? `${card.name}, ${rarity?.name}${locked ? ', not collected' : ''}` : undefined}
    >
      <div className="card-border">
        <div className="card-face">
          <div className="card-head">
            <span className="card-name">{card.name}</span>
            <span className="card-code">{card.code}</span>
          </div>
          <div className="card-art">
            {url && card.fit !== 'cover' && <img className="art-bg" src={url} alt="" aria-hidden="true" loading="lazy" decoding="async" />}
            {url ? <img className={`art art-${card.fit || 'contain'}`} src={url} alt={card.name} loading="lazy" decoding="async" draggable="false" />
              : <ArtFighter card={card} tier={rarity?.tier ?? 0} />}
            <div className="art-fx" />
            {card.limited?.enabled && <span className="card-ltd">LTD{serial ? ` #${serial}/${card.limited.editionSize}` : ` /${card.limited.editionSize}`}</span>}
          </div>
          <div className="card-foot">
            <span className="card-gem" />
            <span className="card-rarity">{rarity?.name}</span>
            <span className="card-num">{footRight || `No.${String(card.collectionNumber).padStart(3, '0')}`}</span>
          </div>
        </div>
      </div>
      <div className="card-glare" />
      {lv != null && <div className={`card-lv lv-t${levelTier(lv)}`} title={`Level ${lv} of ${MAX_LV}`}><small>LV</small>{lv}</div>}
      {stats && <StatBar stats={stats} />}
      {locked && <div className="card-lock"><span>UNCOLLECTED</span></div>}
      {showCount && count > 0 && <div className="card-count">×{count}</div>}
    </div>
  )
}
export default memo(CardFrame)

const MAX_LV = 77
// colour steps for the level badge, matching the rarity bands
export const levelTier = (lv) => (lv >= 70 ? 5 : lv >= 55 ? 4 : lv >= 40 ? 3 : lv >= 25 ? 2 : lv >= 12 ? 1 : 0)

const EL = { ember: ['▲', '#ff7a45'], gale: ['❖', '#b6ff6a'], tide: ['≈', '#4fc3ff'] }
const AB = { pierce: 'PRC', shield: 'SHD', drain: 'DRN', rally: 'RLY', burn: 'BRN', surge: 'SRG' }
// Battle stats strip shown on cards in the Arena and Forge.
export function StatBar({ stats }) {
  const [g, c] = EL[stats.element] || ['?', '#fff']
  return (
    <div className="statbar">
      <span className="sb-el" style={{ color: c }} title={stats.element}>{g}</span>
      {stats.cost != null && <span className="sb-cost" title="Energy cost">{stats.cost}</span>}
      <span className="sb-atk" title="Attack">{stats.atk}</span>
      {stats.hp != null ? <span className="sb-hp" title="Health">{stats.hp}</span> : <span className="sb-def" title="Defense">{stats.def}</span>}
      {stats.abilities?.map((a) => <span key={a} className="sb-ab" title={a}>{AB[a] || a}</span>)}
    </div>
  )
}

export function CardBack({ size = 'md' }) {
  return (
    <div className={`card card-${size} card-back`}>
      <div className="back-face">
        <div className="back-grid" />
        <div className="back-orb" />
        <div className="back-word">ORVEL</div>
      </div>
    </div>
  )
}

// A card without a picture yet shows the fighter it becomes in a duel —
// the same outfit, colours and weapon every time.
function ArtFighter({ card, tier }) {
  const ref = useRef(null)
  const [k, setK] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setK(e.contentRect.height / 170))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const unit = { id: card.id, ref: { kind: 'card', id: card.id }, element: cardStats(card, tier).element, atk: 1, hp: 1, abilities: [] }
  return (
    <div ref={ref} className="art-fighter" aria-hidden="true">
      {k > 0 && <div className="af-box" style={{ transform: `translateX(-50%) scale(${k})` }}><Fighter unit={unit} rarity={{ tier }} side="you" pose="still" /></div>}
    </div>
  )
}
