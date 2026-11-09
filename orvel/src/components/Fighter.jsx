import { memo, useId } from 'react'

// A card on the table becomes a fighter: a small armoured character whose
// armour colour comes from its element, whose trim comes from its rarity,
// whose weapon comes from its strongest trait, and who carries the card's
// own artwork on a chest emblem.

const ARMOUR = {
  ember: { a: '#c8452a', b: '#7a2412', t: '#ffb36b' },
  gale: { a: '#3f9a4e', b: '#1d5a2a', t: '#c6ff6a' },
  tide: { a: '#2f6fbb', b: '#173f73', t: '#8ff3ff' },
}
const BY_ABILITY = { pierce: 'spear', burn: 'flame', drain: 'scythe', counter: 'sword', hex: 'staff', rally: 'banner', surge: 'daggers', shield: 'hammer' }

export function weaponFor(u) {
  const a = u.abilities?.find((x) => BY_ABILITY[x])
  if (a) return BY_ABILITY[a]
  return u.atk >= u.hp ? 'axe' : 'sword'
}
const hasShield = (u) => u.abilities?.includes('shield') || u.abilities?.includes('counter') || u.hp >= u.atk + 5
export const WEAPON_NAMES = { sword: 'Sword', axe: 'Battle axe', spear: 'Spear', hammer: 'War hammer', staff: 'Hex staff', flame: 'Fire staff', scythe: 'Scythe', banner: 'War banner', daggers: 'Twin daggers' }

function Weapon({ kind, trim, glow }) {
  const steel = '#e6eef7', steel2 = '#9fb2c5', wood = '#7a4a26'
  switch (kind) {
    case 'axe': return <g><rect x="44" y="24" width="2.6" height="36" rx="1" fill={wood} /><path d="M46 24 C56 22 58 34 46 38 Z" fill={steel} stroke={steel2} strokeWidth="1" /></g>
    case 'spear': return <g><rect x="44.4" y="6" width="2" height="56" fill={wood} /><path d="M45.4 0 L49 10 L45.4 13 L41.8 10 Z" fill={steel} stroke={steel2} strokeWidth=".8" /><rect x="42.5" y="12" width="6" height="2" fill={trim} /></g>
    case 'hammer': return <g><rect x="44" y="26" width="2.8" height="34" rx="1" fill={wood} /><rect x="37" y="18" width="17" height="11" rx="2" fill={steel2} stroke="#5d6b7a" strokeWidth="1" /><rect x="37" y="22" width="17" height="2.5" fill={trim} /></g>
    case 'staff': return <g><rect x="44.3" y="16" width="2.4" height="46" fill="#4a2a6a" /><circle cx="45.5" cy="13" r="5.5" fill="#c79bff" stroke="#fff" strokeWidth="1" /><circle cx="45.5" cy="13" r="9" fill={glow || '#b388ff'} opacity=".3" /></g>
    case 'flame': return <g><rect x="44.3" y="18" width="2.4" height="44" fill={wood} /><path d="M45.5 2 C51 9 50 14 45.5 19 C41 14 40 9 45.5 2 Z" fill="#ff7a45" /><path d="M45.5 8 C48 12 47.5 15 45.5 18 C43.5 15 43 12 45.5 8 Z" fill="#ffd166" /></g>
    case 'scythe': return <g><rect x="44.3" y="8" width="2.4" height="54" fill="#3a2a2a" /><path d="M45.5 9 C36 4 26 8 22 18 C30 12 38 12 45.5 15 Z" fill={steel} stroke={steel2} strokeWidth=".8" /></g>
    case 'banner': return <g><rect x="44.4" y="4" width="2" height="58" fill={wood} /><circle cx="45.4" cy="4" r="2" fill={trim} /><path d="M46.4 7 L62 9 L58 16 L62 23 L46.4 22 Z" fill={trim} stroke="#0006" strokeWidth=".8" /></g>
    case 'daggers': return <g><path d="M45.5 34 L47.5 52 L43.5 52 Z" fill={steel} stroke={steel2} strokeWidth=".8" /><rect x="41.5" y="52" width="8" height="2" fill={trim} /></g>
    default: return <g><rect x="43.8" y="20" width="3.4" height="33" rx="1" fill={steel} stroke={steel2} strokeWidth=".8" /><path d="M43.8 20 L45.5 15 L47.2 20 Z" fill={steel} /><rect x="39.5" y="52" width="12" height="3" rx="1" fill={trim} /><rect x="44.3" y="55" width="2.4" height="5" fill={wood} /></g>
  }
}

function Fighter({ unit, art, rarity, side }) {
  const uid = useId().replace(/:/g, '')
  const c = ARMOUR[unit.element] || ARMOUR.tide
  const tier = rarity?.tier ?? 1
  const rc = rarity?.color || c.t
  const weapon = weaponFor(unit)
  const shield = hasShield(unit) && weapon !== 'daggers' && weapon !== 'banner'
  return (
    <div className={`ftr ftr-${side} ftier-${tier} wpn-${weapon}`}>
      {tier >= 5 && <div className="f-aura" />}
      <svg viewBox="-4 -4 72 92" aria-hidden="true">
        <defs>
          <clipPath id={`em${uid}`}><circle cx="32" cy="46" r="7.5" /></clipPath>
          <linearGradient id={`ar${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.a} /><stop offset="1" stopColor={c.b} /></linearGradient>
        </defs>
        {/* cape */}
        {tier >= 3 && <path d="M19 35 L45 35 L52 78 L32 72 L12 78 Z" fill={rc} opacity=".85" stroke="#0005" strokeWidth="1" />}
        {/* legs */}
        <g className="f-legs">
          <rect x="23.5" y="62" width="7" height="15" rx="2" fill={c.b} />
          <rect x="33.5" y="62" width="7" height="15" rx="2" fill={c.b} />
          <rect x="22" y="75" width="9.5" height="5" rx="2" fill="#2a1a12" />
          <rect x="32.5" y="75" width="9.5" height="5" rx="2" fill="#2a1a12" />
        </g>
        {/* shield arm */}
        <rect x="14" y="37" width="7" height="18" rx="3" fill={c.b} />
        {shield && <path d="M6 40 L22 40 L22 52 C22 59 14 64 14 64 C14 64 6 59 6 52 Z" fill={c.t} stroke="#0007" strokeWidth="1.2" />}
        {shield && <path d="M14 44 L18 50 L14 58 L10 50 Z" fill={rc} opacity=".9" />}
        {weapon === 'daggers' && <g transform="translate(-30 4)"><path d="M45.5 34 L47.5 52 L43.5 52 Z" fill="#e6eef7" stroke="#9fb2c5" strokeWidth=".8" /><rect x="41.5" y="52" width="8" height="2" fill={c.t} /></g>}
        {/* body */}
        <rect x="19" y="33" width="26" height="31" rx="6" fill={`url(#ar${uid})`} stroke="#0007" strokeWidth="1.2" />
        <rect x="19" y="54" width="26" height="4" fill={c.t} opacity=".9" />
        <circle cx="32" cy="46" r="9" fill={c.t} stroke="#0007" strokeWidth="1" />
        {art ? <image href={art} x="24.5" y="38.5" width="15" height="15" preserveAspectRatio="xMidYMid slice" clipPath={`url(#em${uid})`} /> : <circle cx="32" cy="46" r="7.5" fill={c.b} />}
        {/* head */}
        <circle cx="32" cy="23" r="10.5" fill="#f1c7a5" stroke="#0006" strokeWidth="1" />
        <path d="M21 23 C21 11 43 11 43 23 L43 21 L21 21 Z" fill={`url(#ar${uid})`} stroke="#0007" strokeWidth="1" />
        <rect x="21" y="20" width="22" height="3.5" fill={c.t} />
        <rect x="27" y="25" width="2.6" height="3" fill="#1a1a2a" />
        <rect x="34.4" y="25" width="2.6" height="3" fill="#1a1a2a" />
        {tier >= 2 && <path d="M32 12 C38 4 46 6 48 10 C42 9 37 11 33 15 Z" fill={rc} stroke="#0005" strokeWidth=".8" />}
        {tier >= 4 && <path d="M23 13 L26 6 L29 11 L32 4 L35 11 L38 6 L41 13 Z" fill="#ffd166" stroke="#7a4a00" strokeWidth=".8" />}
        {/* weapon arm — this group swings when the fighter attacks */}
        <g className="f-arm">
          <rect x="42" y="36" width="7" height="19" rx="3" fill={c.b} />
          <Weapon kind={weapon} trim={c.t} glow={rc} />
          <circle cx="45.5" cy="56" r="3.4" fill="#f1c7a5" stroke="#0006" strokeWidth=".8" />
        </g>
      </svg>
    </div>
  )
}
export default memo(Fighter)
