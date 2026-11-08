import { memo, useRef } from 'react'
import { useArtUrl } from '../store.jsx'

// The collectible frame. Artwork is never resampled or cropped by default:
// it sits `contain`-fitted over a soft blurred copy of itself, so any aspect
// ratio fills the window without distortion. Admins can opt a card into
// `cover` when they prefer edge-to-edge.
function CardFrame({ card, rarity, owned = null, count = 0, size = 'md', tilt = true, onClick, showCount = true, revealing = false, serial = null }) {
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
      className={`card card-${size} fx-${effect} ${locked ? 'card-locked' : ''} ${onClick ? 'card-click' : ''} ${revealing ? 'card-revealing' : ''}`}
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
              : <div className="art-missing">NO ART</div>}
            <div className="art-fx" />
            {card.limited?.enabled && <span className="card-ltd">LTD{serial ? ` #${serial}/${card.limited.editionSize}` : ` /${card.limited.editionSize}`}</span>}
          </div>
          <div className="card-foot">
            <span className="card-gem" />
            <span className="card-rarity">{rarity?.name}</span>
            <span className="card-num">No.{String(card.collectionNumber).padStart(3, '0')}</span>
          </div>
        </div>
      </div>
      <div className="card-glare" />
      {locked && <div className="card-lock"><span>UNCOLLECTED</span></div>}
      {showCount && count > 0 && <div className="card-count">×{count}</div>}
    </div>
  )
}
export default memo(CardFrame)

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
