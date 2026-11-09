import { memo, useMemo } from 'react'
import { avatarPixels } from '../server/battle.js'
import { contestantLook } from './Fighter.jsx'
import { CREW_ART } from '../lib/crewArt.js'

// A portrait. Arena contestants (and Pip the trainer) are members of the
// ORVEL crew and show the creator's own artwork of them; everyone else gets a
// retro 12×12 pixel face, unique per player id.
function Avatar({ seed, size = 48, ring, facing = 'right' }) {
  const c = useMemo(() => contestantLook(seed), [seed])
  const px = useMemo(() => (c ? null : avatarPixels(seed)), [seed, c])
  if (c) {
    return (
      <span className="avatar avatar-crew" style={{ width: size, height: size, '--ring': ring || 'var(--line2)' }} aria-hidden="true">
        <img src={CREW_ART[c.crew].face} alt="" draggable="false" style={facing === 'left' ? { transform: 'scaleX(-1)' } : undefined} />
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
