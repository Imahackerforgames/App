import { memo, useMemo } from 'react'
import { avatarPixels, RIVALS } from '../server/battle.js'
import { PORTRAITS, portraitById } from '../lib/portraits.js'

// Arena contestants wear the creator's drawn portraits, dealt in a shuffled
// order so neighbours in the lobby never share a face. Pip gets one too.
const CONTESTANT_ORDER = [2, 0, 4, 1, 3, 0, 2, 4, 1, 3, 2, 0]
export function contestantPortrait(id) {
  if (id === 'trainer-pip') return PORTRAITS[3]
  const i = RIVALS.findIndex((r) => r.id === id)
  return i < 0 ? null : PORTRAITS[CONTESTANT_ORDER[i % CONTESTANT_ORDER.length]]
}

// A player's own picture: set on their profile (saved with their account),
// or kept on this device if the server can't store it yet.
export function playerPic(player) {
  if (player?.avatar) return player.avatar
  try { const v = JSON.parse(localStorage.getItem('orvel:avatar') || 'null'); if (v) return v } catch {}
  return null
}
const picSrc = (pic) => (pic?.kind === 'upload' ? pic.data : pic?.kind === 'preset' ? portraitById(pic.id)?.src : null)

// A portrait: a contestant's drawn portrait, a player's chosen picture, or —
// when there is none — a retro 12×12 pixel face unique per player.
function Avatar({ seed, size = 48, ring, pic = null }) {
  const src = useMemo(() => picSrc(pic) || contestantPortrait(seed)?.src || null, [seed, pic])
  const px = useMemo(() => (src ? null : avatarPixels(seed)), [seed, src])
  if (src) {
    return (
      <span className="avatar avatar-pic" style={{ width: size, height: size, '--ring': ring || 'var(--line2)' }} aria-hidden="true">
        <img src={src} alt="" draggable="false" />
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
