import { memo, useMemo } from 'react'
import { avatarPixels } from '../server/battle.js'

// Retro 12×12 pixel portrait, unique per player id.
function Avatar({ seed, size = 48, ring }) {
  const px = useMemo(() => avatarPixels(seed), [seed])
  return (
    <span className="avatar" style={{ width: size, height: size, '--ring': ring || 'var(--line2)' }}>
      <svg viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden="true">
        {px.map((p, i) => <rect key={i} x={p.x} y={p.y} width="1" height="1" fill={p.c} />)}
      </svg>
    </span>
  )
}
export default memo(Avatar)
