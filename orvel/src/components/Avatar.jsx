import { memo, useMemo } from 'react'
import { avatarPixels } from '../server/battle.js'
import Fighter, { contestantLook } from './Fighter.jsx'

// A portrait. Arena contestants (and Pip the trainer) show their fighter
// from the chest up, idling; everyone else gets a retro 12×12 pixel face,
// unique per player id.
function Avatar({ seed, size = 48, ring, facing = 'right' }) {
  const c = useMemo(() => contestantLook(seed), [seed])
  const px = useMemo(() => (c ? null : avatarPixels(seed)), [seed, c])
  if (c) {
    const k = size / 66
    return (
      <span className="avatar avatar-ftr" style={{ width: size, height: size, '--ring': ring || 'var(--line2)' }} aria-hidden="true">
        <span className="avf-box" style={{ transform: `translateX(-50%) scale(${facing === 'left' ? -k : k}, ${k})`, top: `${-4 * k}px` }}>
          <Fighter unit={c.unit} look={c.look} rarity={{ tier: c.tier }} side="you" pose="idle" />
        </span>
      </span>
    )
  }
  return (
    <span className="avatar" style={{ width: size, height: size, '--ring': ring || 'var(--line2)' }}>
      <svg viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">
        {px.map((p, i) => <rect key={i} x={p.x} y={p.y} width="1" height="1" fill={p.c} />)}
      </svg>
    </span>
  )
}
export default memo(Avatar)

// A contestant standing at full height, for their profile.
export function ContestantFigure({ id, scale = 1 }) {
  const c = useMemo(() => contestantLook(id), [id])
  if (!c) return null
  return (
    <span className="contestant-fig" style={{ width: 100 * scale, height: 156 * scale }} aria-hidden="true">
      <span className="cf-box" style={{ transform: `scale(${scale})` }}><Fighter unit={c.unit} look={c.look} rarity={{ tier: c.tier }} side="you" pose="idle" /></span>
    </span>
  )
}
