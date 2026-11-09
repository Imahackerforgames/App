import { memo } from 'react'
import { RIVALS, ELEMENTS } from '../server/battle.js'

// A card on the battlefield becomes a fighter, drawn in side profile.
//
// The fighters are the ORVEL crew from the creator's concept sheet: ten
// war-worn builds, each with an improvised weapon — Frontline (stop sign),
// Junker (wheel rim), Outcast (chain & lock), Breacher (spiked bat), Hazard
// (fire extinguisher), Lantern (lantern on a chain), Noise (speaker), Veil
// (spiked umbrella), Spotter (floodlight) and Wrecker (sledgehammer).
//
// The body is a real rig: hips, torso, head, two arms (shoulder, elbow,
// wrist) and two legs (hip, knee), each joint its own element that turns
// about its own pivot, with parts at different depths inside a slowly turning
// 3D space, so a fighter plants its feet, winds up, swings and follows through.
//
// Which crew member a card becomes comes from the card itself, so it is the
// same every duel; two cards with the same build still differ in camo, skin,
// hair colour and accent. Rarity adds wear-and-gear: armour plates, red
// armbands, a glow.

export const CREW = [
  { id: 'frontline', name: 'Frontline', role: 'Heavy Assault', weapon: 'stopsign', top: 'jacket', camo: 'desert', hair: 'locs', knee: true },
  { id: 'junker', name: 'Junker', role: 'Scavenger', weapon: 'wheel', top: 'vest', camo: 'dark', hair: 'twists', goggles: true, phones: true },
  { id: 'outcast', name: 'Outcast', role: 'Rogue', weapon: 'chain', top: 'poncho', camo: 'black', hair: 'afro', scarf: true },
  { id: 'breacher', name: 'Breacher', role: 'Demolition', weapon: 'bat', top: 'hoodie', camo: 'redblack', hair: 'hood', mask: true },
  { id: 'hazard', name: 'Hazard', role: 'Chem Ops', weapon: 'extinguisher', top: 'vest', camo: 'woodland', hair: 'locs', goggles: true, scarf: true },
  { id: 'lantern', name: 'Lantern', role: 'Scout', weapon: 'lantern', top: 'tank', camo: 'dark', hair: 'braids' },
  { id: 'noise', name: 'Noise', role: 'Disruptor', weapon: 'speaker', top: 'jacket', camo: 'redblack', hair: 'locs', goggles: true, scarf: true },
  { id: 'veil', name: 'Veil', role: 'Tactical', weapon: 'umbrella', top: 'crop', camo: 'black', hair: 'braids' },
  { id: 'spotter', name: 'Spotter', role: 'Intel', weapon: 'floodlight', top: 'hoodie', camo: 'woodland', hair: 'locs', glasses: true },
  { id: 'wrecker', name: 'Wrecker', role: 'Heavy', weapon: 'sledge', top: 'coat', camo: 'desert', hair: 'hood', goggles: true, glasses: true },
]
export const OUTFIT_NAMES = Object.fromEntries(CREW.map((c) => [c.id, `${c.name} · ${c.role}`]))
export const WEAPON_NAMES = { stopsign: 'Stop sign', wheel: 'Wheel rim', chain: 'Chain & lock', bat: 'Spiked bat', extinguisher: 'Fire extinguisher', lantern: 'Lantern chain', speaker: 'Speaker', umbrella: 'Spiked umbrella', floodlight: 'Floodlight', sledge: 'Sledgehammer' }
// how each weapon fights: run in and slash, thrust, smash overhead, or stay
// back and use it from range (spray, fire, sound, light)
export const STYLE = { stopsign: 'smash', wheel: 'smash', chain: 'slash', bat: 'slash', extinguisher: 'cast', lantern: 'cast', speaker: 'cast', umbrella: 'thrust', floodlight: 'cast', sledge: 'smash' }
const CAMOS = ['desert', 'woodland', 'dark', 'black', 'redblack']
const SKIN = [['#2e1c12', '#1c100a'], ['#3c2416', '#26160c'], ['#4c2e1c', '#301c10'], ['#5e3a24', '#3c2416'], ['#74482c', '#4a2c18']]
const HAIR = ['#0a0706', '#120c08', '#18100a', '#1e140c', '#2a1a10']
const ACCENT = ['#8e1c1c', '#b0281e', '#c8b48a', '#6a6a3a', '#3a3a3a', '#9a4a1a']
const GLOW = { ember: '#ff8a4a', gale: '#b6ff6a', tide: '#6fd6ff' }

function hash(t) { let h = 2166136261; for (const c of String(t)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const keyOf = (u) => (u.ref ? `${u.ref.kind}:${u.ref.id}` : String(u.id))

// The look of one card's fighter. Everything but the rarity extras comes from
// the card's id, so it never changes between duels.
export function loadoutOf(u, tier = 0, force = null) {
  const k = keyOf(u)
  const r = (n, salt) => hash(k + ':' + salt) % n
  const crew = CREW.find((c) => c.id === force?.crew) || CREW[r(CREW.length, 'crew')]
  return {
    ...crew, crew: crew.id, outfit: crew.id,
    camo: force?.camo || (r(3, 'camo') ? crew.camo : CAMOS[r(CAMOS.length, 'camo2')]),
    accent: ACCENT[r(ACCENT.length, 'accent')],
    skin: SKIN[r(SKIN.length, 'skin')], hairC: HAIR[r(HAIR.length, 'hair')],
    tempo: 2.2 + (r(9, 'tempo') / 10),
  }
}
export function weaponFor(u) { return loadoutOf(u).weapon }

// The Arena's contestants are crew members too, dealt in a shuffled order so
// neighbours never match. Their portraits are the creator's own artwork.
const CONTESTANT_CREW = [3, 0, 7, 5, 9, 1, 6, 2, 8, 4, 0, 7]
export function contestantLook(id) {
  const i = RIVALS.findIndex((r) => r.id === id)
  const unit = { id, ref: { kind: 'rival', id }, element: ELEMENTS[hash(id) % ELEMENTS.length].id, atk: 5, hp: 5, abilities: [] }
  if (id === 'trainer-pip') return { unit, tier: 1, crew: 'lantern', look: { crew: 'lantern' } }
  if (i < 0) return null
  const crew = CREW[CONTESTANT_CREW[i % CONTESTANT_CREW.length]].id
  return { unit, tier: Math.min(5, Math.floor((RIVALS[i].level || 1) / 10)), crew, look: { crew } }
}

const S = (v) => ({ fill: `var(--${v})` })
const Shade = ({ d, g = 'cyl' }) => <path d={d} fill={`url(#fd-${g})`} />
// cloth: a camo pattern, grime on top, then cylinder shading
const Cloth = ({ d, camo, g = 'cyl' }) => <><path d={d} fill={`url(#camo-${camo})`} /><path d={d} fill="url(#fd-grime)" /><Shade d={d} g={g} /></>

// Shared patterns and shading, mounted once per screen.
export function FighterDefs() {
  const camo = (id, base, a, b, c) => (
    <pattern id={`camo-${id}`} width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
      <rect width="16" height="16" fill={base} />
      <path d="M1 2 Q5 0 7 3 Q8 6 4 7 Q0 6 1 2 Z M10 9 Q14 7 15 11 Q14 15 10 14 Q8 12 10 9 Z" fill={a} />
      <path d="M8 1 Q11 0 12 3 Q10 5 8 4 Z M2 10 Q5 9 6 12 Q4 15 1 13 Z" fill={b} />
      <path d="M12 4 Q15 4 15 6 Q13 8 12 6 Z M5 13 Q7 12 8 14 Q6 16 5 15 Z" fill={c} />
    </pattern>
  )
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {camo('desert', '#8a7a5c', '#5e4c34', '#b4a27e', '#2e261c')}
        {camo('woodland', '#4e4a32', '#2e2a1c', '#6e5a3a', '#1a1a14')}
        {camo('dark', '#2a2a2c', '#1a1a1c', '#44403a', '#5a5248')}
        {camo('black', '#1c1a1a', '#2c2826', '#121010', '#3a342e')}
        {camo('redblack', '#241818', '#6e1a1a', '#121010', '#4a3a36')}
        <pattern id="fd-grime" width="9" height="11" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="3" r=".6" fill="#000" opacity=".35" /><circle cx="6" cy="8" r=".8" fill="#c8b48a" opacity=".18" /><circle cx="7" cy="2" r=".4" fill="#000" opacity=".3" />
        </pattern>
        <linearGradient id="fd-cyl" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".55" /><stop offset=".3" stopColor="#fff" stopOpacity=".2" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".6" />
        </linearGradient>
        <linearGradient id="fd-vert" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".25" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="fd-metal" x1="0" x2="1" y1="0" y2=".35">
          <stop offset="0" stopColor="#fff" stopOpacity=".5" /><stop offset=".22" stopColor="#fff" stopOpacity="0" /><stop offset=".48" stopColor="#000" stopOpacity=".35" />
          <stop offset=".6" stopColor="#fff" stopOpacity=".6" /><stop offset=".72" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".45" />
        </linearGradient>
        <linearGradient id="fd-wood" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#c09060" /><stop offset=".5" stopColor="#8a6038" /><stop offset="1" stopColor="#5a3a1e" />
        </linearGradient>
        <linearGradient id="fd-steel" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#c8ccd0" /><stop offset=".5" stopColor="#7a7e84" /><stop offset="1" stopColor="#3a3c40" />
        </linearGradient>
        <linearGradient id="fd-red" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e04a3a" /><stop offset=".5" stopColor="#a8221a" /><stop offset="1" stopColor="#5a0e0a" />
        </linearGradient>
        <radialGradient id="fd-skin" cx=".7" cy=".35" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".12" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".35" />
        </radialGradient>
        {/* gloss for props: a bright band across a curved surface, and a hot specular spot */}
        <linearGradient id="fd-gloss" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".22" stopColor="#fff" stopOpacity="0" /><stop offset=".32" stopColor="#fff" stopOpacity=".75" />
          <stop offset=".4" stopColor="#fff" stopOpacity=".12" /><stop offset=".78" stopColor="#fff" stopOpacity="0" /><stop offset=".9" stopColor="#fff" stopOpacity=".22" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fd-glass" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".35" stopColor="#fff" stopOpacity="0" /><stop offset=".6" stopColor="#fff" stopOpacity=".3" /><stop offset=".7" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="fd-spec" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset=".4" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="fd-lamp" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff8d0" /><stop offset=".4" stopColor="#ffc860" /><stop offset="1" stopColor="#ff8a20" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}

// ── parts. Each is drawn in its own little box, pivot at the joint. ──

function Thigh({ L }) {
  const d = 'M1.5 3 Q8.5 -1.5 15.5 3 L14 32 Q8.5 35.5 3.5 32 Z'
  return (
    <svg className="fp" style={{ left: -8, top: -5 }} width="17" height="36" viewBox="0 0 17 36">
      <Cloth d={d} camo={L.camo} />
      {/* cargo pocket */}
      <path d="M10 14 L15 14.4 L14.6 23 L10 22.6 Z" fill={`url(#camo-${L.camo})`} stroke="#0008" strokeWidth=".6" />
      <path d="M10 14 L15 14.4 L15 16 L10 15.6 Z" fill="#0006" />
      <path d="M2 9 L15 10.4" stroke="#1a1410" strokeWidth="1.4" />
    </svg>
  )
}
function Shin({ L }) {
  const shin = 'M2.5 1 L14.5 1 L13.5 22 L3.5 22 Z'
  const boot = 'M2 14 L14.4 14 L14.6 25 Q23.6 26 24.6 30.4 L24.6 33 L1.6 33 Z'
  return (
    <svg className="fp" style={{ left: -8, top: -3 }} width="26" height="36" viewBox="0 0 26 36">
      <Cloth d={shin} camo={L.camo} />
      {L.knee && <><path d="M1.4 -1 Q8.5 -3.6 15.6 -1 L15 6 Q8.5 8 2 6 Z" fill="#26241f" stroke="#000" strokeWidth=".5" /><Shade d="M1.4 -1 Q8.5 -3.6 15.6 -1 L15 6 Q8.5 8 2 6 Z" g="metal" /></>}
      {/* tall black combat boots, laced, thick sole */}
      <path d={boot} fill="#151312" /><Shade d={boot} g="vert" />
      <path d="M5 16 L12 17 M5 19 L12 20 M5 22 L12 23 M6 25 L13 26" stroke="#5a5650" strokeWidth=".7" />
      <path d="M1.4 30.6 L24.8 30.6 L24.8 34.4 L1.4 34.4 Z" fill="#050505" />
      <path d="M2 14 L14.4 14" stroke="#3a3632" strokeWidth="1.4" />
    </svg>
  )
}
function Torso({ L, tier }) {
  const chest = 'M8 7 Q17 2 25 6 Q32 11 31 22 Q30 31 27 38 L8 38 Q4 26 5 16 Q5.5 9 8 7 Z'
  const long = L.top === 'coat' || L.top === 'poncho'
  const H = long ? 86 : 56
  const hem = long ? 'M4 30 L31 30 L34 80 L30 76 L27 84 L23 77 L19 85 L15 77 L11 84 L7 76 L2 81 Z' : null
  return (
    <svg className="fp" style={{ left: -18, top: -48 }} width="36" height={H} viewBox={`0 0 36 ${H}`}>
      {/* a long coat or poncho hangs to the knees, ragged at the hem */}
      {hem && <Cloth d={hem} camo={L.top === 'poncho' ? 'black' : L.camo} />}
      {hem && L.top === 'poncho' && <path d="M8 40 Q10 60 8 78 M22 40 Q24 62 23 80" stroke="#8a7a5c" strokeOpacity=".35" strokeWidth="2.4" fill="none" />}
      {/* the layer under everything: black tee or bare skin */}
      <path d={chest} fill={L.top === 'crop' || L.top === 'tank' ? '#141414' : '#1a1a1a'} />
      {L.top === 'crop' && <><path d="M7 25 L29 25 L28 37 L8 37 Z" style={S('skin')} /><path d="M7 25 L29 25 L28 37 L8 37 Z" fill="url(#fd-skin)" /><path d="M8 8 Q17 3 26 7 L29 25 L7 25 Z" fill="#c8b8a0" /><Shade d="M8 8 Q17 3 26 7 L29 25 L7 25 Z" /></>}
      {L.top === 'tank' && <><path d="M9 6 L15 5 L14 10 Z M23 5 L28 8 L26 12 Z" style={S('skin')} /><path d="M10 10 L27 33 M27 10 L10 33" stroke="#2a2420" strokeWidth="2" /><circle cx="18.5" cy="21.5" r="1.8" fill="#6a6660" /></>}
      {(L.top === 'jacket' || L.top === 'hoodie' || L.top === 'coat' || L.top === 'poncho') && <Cloth d={chest} camo={L.top === 'hoodie' ? (L.camo === 'redblack' ? 'redblack' : 'dark') : L.top === 'poncho' ? 'black' : L.camo} />}
      {L.top === 'hoodie' && <><path d="M14 24 L28 24 L27 32 L15 32 Z" fill="#0006" /><path d="M6 6 Q4 14 7 20" stroke="#000" strokeOpacity=".4" strokeWidth="2" fill="none" /></>}
      {L.top === 'jacket' && <><path d="M23 6 L27 34" stroke="#0008" strokeWidth="1" /><rect x="17" y="12" width="7" height="6" rx="1" fill={`url(#camo-${L.camo})`} stroke="#000a" strokeWidth=".6" /><path d="M17 12 H24 V14 H17 Z" fill="#0006" /></>}
      {/* tactical vest with pouches */}
      {(L.top === 'vest' || L.top === 'jacket' || tier >= 2) && L.top !== 'crop' && L.top !== 'poncho' && <>
        <path d="M9 9 Q17 6 26 9 L29 33 L9 33 Q7 20 9 9 Z" fill="#23211d" opacity=".95" /><Shade d="M9 9 Q17 6 26 9 L29 33 L9 33 Q7 20 9 9 Z" />
        <rect x="18" y="20" width="5" height="7" rx="1" fill="#33302a" stroke="#000" strokeWidth=".5" /><rect x="24" y="20" width="4.6" height="7" rx="1" fill="#33302a" stroke="#000" strokeWidth=".5" />
        <rect x="11" y="13" width="6" height="5" rx="1" fill="#33302a" stroke="#000" strokeWidth=".5" />
        <path d="M18 20 H23 M24 20 H28.6" stroke="#5a564e" strokeWidth=".8" />
      </>}
      {/* chains and straps across the chest for the rough builds */}
      {(L.crew === 'outcast' || L.crew === 'lantern' || L.crew === 'noise') && <path d="M9 9 Q17 22 28 31" stroke="#8a8a8a" strokeWidth="1.2" strokeDasharray="1.4 1" fill="none" />}
      {/* accent armband / patches at higher rarity */}
      {tier >= 3 && <path d="M8 26 L29 25 L29 28 L8 29 Z" style={{ fill: 'var(--accent)' }} opacity=".9" />}
      {/* belt with buckle and pouches */}
      <path d="M6.6 34 L29.4 34 L29.4 39 L6.6 39 Z" fill="#141210" />
      <rect x="20" y="33.6" width="4.6" height="5.8" rx=".8" fill="#9a968e" />
      <rect x="8" y="37" width="6" height="7" rx="1" fill="#2e2a24" stroke="#000" strokeWidth=".5" />
      {!long && <path d="M7 38 L29 38 L30 46 L6 46 Z" fill={`url(#camo-${L.camo})`} />}
    </svg>
  )
}
function Head({ L }) {
  const face = 'M14.5 2 Q25 2 25.5 11 L28 16.5 Q28.3 17.6 26.5 18 L25.8 18.2 Q26 21 24 23.5 Q20 26.5 14.5 25.5 Q8 24 5.6 17 Q3.6 9 8 4.6 Q10.8 2 14.5 2 Z'
  const hood = L.hair === 'hood'
  return (
    <svg className="fp" style={{ left: -15, top: -45 }} width="34" height="50" viewBox="-2 -14 34 50">
      {/* hair that falls behind: braids and long locs */}
      {L.hair === 'braids' && <g stroke="var(--hairC)" strokeWidth="2.2" strokeLinecap="round" fill="none"><path d="M7 8 Q2 20 4 34" /><path d="M9 8 Q5 22 7 35" /><path d="M11 8 Q8 22 10 33" /></g>}
      {hood && <path d="M1.6 19 Q-1.6 1 14 -2 Q27.6 -2 28 10 L26 27 L9 34 Q2 29 1.6 19 Z" fill={`url(#camo-${L.crew === 'breacher' ? 'black' : L.camo})`} />}
      {hood && <Shade d="M1.6 19 Q-1.6 1 14 -2 Q27.6 -2 28 10 L26 27 L9 34 Q2 29 1.6 19 Z" />}
      {/* neck, face in profile */}
      <path d="M10 22 L18 22 L19 33 L9 33 Z" style={S('skin')} /><path d="M10 22 L18 22 L19 33 L9 33 Z" fill="#000" opacity=".25" />
      <path d={face} style={S('skin')} /><path d={face} fill="url(#fd-skin)" />
      <path d="M11.6 11 Q9 11 9.2 14.5 Q9.4 17.5 12 17.6 Q12.8 14 11.6 11 Z" style={S('skinD')} />
      <path d="M20.2 11.2 Q22.6 10.2 24.4 11.6 Q22.5 13 20.2 11.2 Z" fill="#ece6dc" />
      <circle cx="22.7" cy="11.6" r="1" fill="#120a06" />
      <path d="M19.4 9.2 Q22.4 7.6 25.4 9.4" stroke="#120a06" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      <path d="M22.6 20.6 Q24.4 20.9 25.4 20.2" stroke="#3a1e14" strokeWidth=".8" fill="none" strokeLinecap="round" />
      <path d="M25.8 18.2 Q24.5 18.8 23.6 18" stroke="var(--skinD)" strokeWidth=".7" fill="none" />
      {L.mask && <path d="M14 15 Q20 14 28.4 16 Q28.6 22 24.6 25.4 Q19 27.6 14.6 25 Z" fill="#141414" />}
      {L.glasses && <><rect x="19" y="9.6" width="6.6" height="4.2" rx="1.4" fill="#ffffff22" stroke="#0a0a0a" strokeWidth="1" /><path d="M19 11.4 L12 11" stroke="#0a0a0a" strokeWidth=".9" /></>}
      {/* hair */}
      {L.hair === 'afro' && <path d="M3 13 Q-1 2 8 -2 Q15 -6 22 -2 Q28 1 26.4 8 Q22 5 17 6 Q12 7.6 11.4 13 Q7 12.6 3 13 Z" style={S('hairC')} />}
      {L.hair === 'afro' && <path d="M3 13 Q-1 2 8 -2 Q15 -6 22 -2 Q28 1 26.4 8" fill="none" stroke="#000" strokeOpacity=".4" strokeWidth="1" strokeDasharray="1 1.4" />}
      {(L.hair === 'locs' || L.hair === 'twists') && <>
        <path d="M5 14 Q2 3 12 0.6 Q22 -1 25.6 6.6 Q21 4.6 16.6 6 Q12.6 8 11.6 12 Q8 12 5 14 Z" style={S('hairC')} />
        <g stroke="var(--hairC)" strokeWidth={L.hair === 'locs' ? 1.8 : 1.4} strokeLinecap="round" fill="none">
          {[[6, 2, 1, 14], [9, 0, 4, 12], [13, -1, 8, 9], [17, -1, 14, 7], [21, 0, 21, 6], [24, 2, 26, 7], [4, 6, 2, 17], [8, 3, 5, 18]].map(([x1, y1, x2, y2], i) => <path key={i} d={`M${x1} ${y1} Q${(x1 + x2) / 2 + 2} ${(y1 + y2) / 2} ${x2} ${y2 + (L.hair === 'locs' ? 3 : 0)}`} />)}
        </g>
      </>}
      {L.hair === 'braids' && <><path d="M5 13 Q3 2 13 1 Q22 0 25.4 6.6 Q20 4.6 15 6.4 Q11 8 10.6 12.4 Q7.6 11.6 5 13 Z" style={S('hairC')} /><path d="M6 4 Q14 1 24 5 M6 7 Q12 4.6 20 5.4" stroke="#000" strokeOpacity=".45" strokeWidth=".7" fill="none" /></>}
      {hood && <path d="M3 17 Q2 2 14 0 Q26 0 27.4 10 Q22 4 16 5 Q8 7 7.4 17 Z" fill={`url(#camo-${L.crew === 'breacher' ? 'black' : L.camo})`} />}
      {/* goggles pushed up on the forehead */}
      {L.goggles && <><path d="M4 7 Q14 1 27 4" stroke="#1a1a1a" strokeWidth="2" fill="none" /><ellipse cx="21" cy="3.6" rx="3.6" ry="3" fill="#2a2a2a" stroke="#6a6a6a" strokeWidth="1" /><ellipse cx="21.4" cy="3.4" rx="2.2" ry="1.8" fill="#7ab0c8" opacity=".75" /><ellipse cx="14.6" cy="3.2" rx="3" ry="2.6" fill="#2a2a2a" stroke="#5a5a5a" strokeWidth=".8" /></>}
      {L.phones && <><path d="M8 4 Q8 -3 15 -3" stroke="#1a1a1a" strokeWidth="1.6" fill="none" /><rect x="7.6" y="22" width="6" height="7" rx="2" fill="#1a1a1a" /></>}
      {/* a scarf wrapped thick around the neck */}
      {L.scarf && <path d="M6 24 Q14 20 23 23.6 L24 31 Q14 34 6 30.6 Z" fill="#a8977a" />}
      {L.scarf && <path d="M6 24 Q14 20 23 23.6 L24 31 Q14 34 6 30.6 Z M7 27 Q15 25 23.4 27.4" fill="url(#fd-grime)" stroke="#6a5a42" strokeWidth=".7" />}
    </svg>
  )
}
function UpperArm({ L }) {
  const arm = 'M2.6 5 Q8.5 1 14.4 5 L13 28 Q8.5 31 4 28 Z'
  const bare = L.top === 'tank' || L.top === 'vest'
  return (
    <svg className="fp" style={{ left: -8, top: -7 }} width="17" height="32" viewBox="0 0 17 32">
      {bare ? <><path d={arm} style={S('skin')} /><Shade d={arm} /></> : <Cloth d={arm} camo={L.top === 'hoodie' || L.top === 'crop' ? 'dark' : L.top === 'poncho' ? 'black' : L.camo} />}
      {L.crew === 'frontline' && <><path d="M0.6 9 Q0 0.6 8.5 0.4 Q16.6 0.6 16.4 9 Q12 7 8.5 7.6 Q4.6 7 0.6 9 Z" fill="#2c2a26" /><Shade d="M0.6 9 Q0 0.6 8.5 0.4 Q16.6 0.6 16.4 9 Q12 7 8.5 7.6 Q4.6 7 0.6 9 Z" g="metal" /></>}
      {L.top === 'vest' && <path d="M1 3 Q8.5 -1 16 3 L15.6 8 Q8.5 5 1.4 8 Z" fill="#23211d" />}
      <path d="M3 16 L14 17.4" style={{ stroke: 'var(--accent)' }} strokeWidth="2.6" opacity=".85" />
    </svg>
  )
}
function Forearm({ L }) {
  const d = 'M2.5 1 L12.5 1 L11 21 L4 21 Z'
  const sleeve = !(L.top === 'tank' || L.top === 'vest')
  return (
    <svg className="fp" style={{ left: -7, top: -3 }} width="15" height="28" viewBox="0 0 15 28">
      {sleeve ? <Cloth d={d} camo={L.top === 'hoodie' || L.top === 'crop' ? 'dark' : L.top === 'poncho' ? 'black' : L.camo} /> : <><path d={d} style={S('skin')} /><Shade d={d} /></>}
      {/* black wraps / arm guard */}
      <path d="M2.4 11 L12.6 11 L11.4 21 L3.6 21 Z" fill="#141414" /><Shade d="M2.4 11 L12.6 11 L11.4 21 L3.6 21 Z" />
      <path d="M2.6 13 L12.4 14 M2.8 16 L12.2 17 M3 19 L12 20" stroke="#3a3a3a" strokeWidth=".7" />
    </svg>
  )
}
function Fist() {
  const d = 'M1.4 2.6 Q5.5 -0.4 9.6 2.6 L9.8 7.6 Q5.5 10.6 1.2 7.6 Z'
  return (
    <svg className="fp" style={{ left: -5.5, top: -5 }} width="11" height="11" viewBox="0 0 11 11">
      <path d={d} fill="#161616" /><Shade d={d} />
      <path d="M3 3.6 L3 6.6 M5.5 3.2 L5.5 6.8 M8 3.6 L8 6.6" style={{ stroke: 'var(--skin)' }} strokeWidth="1" />
    </svg>
  )
}

// Weapons are drawn with the grip at (G, 20) and the business end along +x.
const G = 18
function Weapon({ kind }) {
  const box = { stopsign: [96, 40], wheel: [60, 44], chain: [74, 40], bat: [72, 40], extinguisher: [64, 40], lantern: [48, 60], speaker: [52, 44], umbrella: [92, 40], floodlight: [64, 44], sledge: [76, 40] }[kind] || [70, 40]
  let body
  switch (kind) {
    case 'stopsign': body = <>
      <rect x="2" y="18.6" width="66" height="2.8" rx="1" fill="url(#fd-steel)" />
      <path d="M2 18 L6 18 M2 22 L6 22" stroke="#1a1a1a" strokeWidth="1.6" />
      <path d="M72 4 L84 4 L92 12 L92 28 L84 36 L72 36 L64 28 L64 12 Z" fill="url(#fd-red)" stroke="#e8e0d8" strokeWidth="1.6" />
      <text x="78" y="23" textAnchor="middle" fontSize="7" fontWeight="900" fill="#f4ece4" fontFamily="Arial, sans-serif">STOP</text>
      <path d="M66 12 L74 6 M86 32 L90 26" stroke="#3a1a10" strokeWidth="1.4" opacity=".6" />
    </>; break
    case 'wheel': body = <>
      <circle cx="34" cy="22" r="19" fill="#2a2826" stroke="#5a5650" strokeWidth="2" />
      <circle cx="34" cy="22" r="13" fill="#3a3834" stroke="#7a766e" strokeWidth="1.4" />
      {[0, 60, 120, 180, 240, 300].map((a) => <rect key={a} x="32.6" y="10" width="2.8" height="12" fill="#6a665e" transform={`rotate(${a} 34 22)`} />)}
      <circle cx="34" cy="22" r="4" fill="#8a8680" stroke="#2a2826" />
      <circle cx="34" cy="22" r="19" fill="url(#fd-metal)" opacity=".5" />
    </>; break
    case 'chain': body = <>
      {Array.from({ length: 9 }, (_, i) => <ellipse key={i} cx={20 + i * 4.6} cy="20" rx="3" ry={i % 2 ? 1.2 : 2} fill="none" stroke="#9a9a9a" strokeWidth="1.3" />)}
      <rect x="60" y="14" width="12" height="13" rx="2" fill="url(#fd-steel)" stroke="#2a2a2a" strokeWidth=".8" />
      <path d="M62 14 Q62 7 66 7 Q70 7 70 14" fill="none" stroke="#8a8a8a" strokeWidth="2" />
      <circle cx="66" cy="20" r="1.4" fill="#1a1a1a" />
    </>; break
    case 'bat': body = <>
      <path d="M6 18.6 L30 17.6 Q60 15 68 16.6 Q70 20 68 23.4 Q60 25 30 22.4 L6 21.4 Z" fill="url(#fd-wood)" stroke="#3a2412" strokeWidth=".6" />
      <path d="M6 18 L20 17.6 L20 22.4 L6 22 Z" fill="#1a1a1a" />
      {[44, 50, 56, 62].map((x, i) => <g key={x} stroke="#c8ccd0" strokeWidth="1"><path d={`M${x} ${15.4 - (i % 2)} L${x + 1} ${11 - (i % 2)}`} /><path d={`M${x + 2} ${24.6} L${x + 3} ${29}`} /></g>)}
    </>; break
    case 'extinguisher': body = <>
      <rect x="18" y="12" width="36" height="16" rx="7" fill="url(#fd-red)" stroke="#3a0a08" strokeWidth=".8" />
      <rect x="28" y="15" width="12" height="10" fill="#f0e8dc" opacity=".85" />
      <path d="M30 18 L38 18 M30 21 L36 21" stroke="#a8221a" strokeWidth="1.2" />
      <rect x="54" y="16" width="5" height="8" fill="#1a1a1a" />
      <path d="M59 20 L64 18 L64 22 Z" fill="#1a1a1a" />
      <path d="M14 14 L20 14 L20 26 L14 26 Z" fill="#2a2a2a" />
    </>; break
    case 'lantern': body = <>
      {Array.from({ length: 4 }, (_, i) => <ellipse key={i} cx={20 + i * 3.4} cy={20 + i * 3} rx="1.4" ry="2" fill="none" stroke="#8a8a8a" strokeWidth="1" />)}
      <path d="M28 32 L40 32 L42 36 L42 50 L40 54 L28 54 L26 50 L26 36 Z" fill="#1e1c1a" stroke="#5a5650" strokeWidth=".8" />
      <rect x="28.6" y="36" width="10.8" height="14" rx="2" fill="url(#fd-lamp)" />
      <circle cx="34" cy="43" r="9" fill="#ffc860" opacity=".35" className="w-glow" />
      <path d="M30 32 Q34 26 38 32" fill="none" stroke="#5a5650" strokeWidth="1.2" />
    </>; break
    case 'speaker': body = <>
      <rect x="16" y="4" width="32" height="34" rx="3" fill="#1c1b1a" stroke="#4a4844" strokeWidth="1" />
      <circle cx="32" cy="24" r="9" fill="#0c0c0c" stroke="#5a5650" strokeWidth="1.4" />
      <circle cx="32" cy="24" r="3.6" fill="#3a3834" />
      <circle cx="32" cy="10" r="3" fill="#0c0c0c" stroke="#5a5650" strokeWidth=".8" />
      <rect x="16" y="4" width="32" height="34" rx="3" fill="url(#fd-cyl)" />
    </>; break
    case 'umbrella': body = <>
      <rect x="6" y="19" width="80" height="2" fill="#2a2a2a" />
      <path d="M6 16 Q2 20 6 24" fill="none" stroke="#2a2a2a" strokeWidth="2.4" />
      <path d="M26 20 Q40 12 78 18 L86 20 L78 22 Q40 28 26 20 Z" fill="#4a1414" stroke="#1a0606" strokeWidth=".7" />
      <path d="M30 20 L80 20 M34 17 L76 19 M34 23 L76 21" stroke="#000" strokeOpacity=".4" strokeWidth=".6" />
      {[34, 44, 54, 64].map((x) => <g key={x} stroke="#c8ccd0" strokeWidth=".9"><path d={`M${x} ${16.6 - (x - 30) / 12} L${x + 2} ${12}`} /><path d={`M${x} ${23.4 + (x - 30) / 12} L${x + 2} ${28}`} /></g>)}
      <path d="M86 20 L92 20" stroke="#c8ccd0" strokeWidth="1.4" />
    </>; break
    case 'floodlight': body = <>
      <rect x="10" y="18.4" width="20" height="3.4" fill="#1a1a1a" />
      <rect x="28" y="6" width="28" height="32" rx="2" fill="#2a2826" stroke="#5a5650" strokeWidth="1" />
      <rect x="54" y="8" width="5" height="28" fill="#fff8e0" className="w-glow" />
      {[12, 18, 24, 30].map((y) => <path key={y} d={`M30 ${y} L54 ${y}`} stroke="#4a4844" strokeWidth=".8" />)}
      <rect x="57" y="4" width="10" height="36" fill="#fff4c0" opacity=".3" className="w-glow" />
    </>; break
    case 'sledge': body = <>
      <rect x="2" y="18.4" width="60" height="3.6" rx="1.2" fill="url(#fd-wood)" />
      <path d="M2 18 L14 18 L14 22.4 L2 22.4 Z" fill="#1a1a1a" />
      <rect x="54" y="6" width="20" height="28" rx="2" fill="url(#fd-steel)" stroke="#2a2a2a" strokeWidth=".8" />
      <path d="M54 12 L74 12 M54 28 L74 28" stroke="#2a2a2a" strokeWidth=".8" />
    </>; break
    default: body = null
  }
  const top = kind === 'lantern' ? -20 : -20
  return (
    <svg className={`fp weapon wpn-${kind}`} style={{ left: -G, top }} width={box[0]} height={box[1]} viewBox={`0 0 ${box[0]} ${box[1]}`}>
      {body}
    </svg>
  )
}

function Fighter({ unit, rarity, side, pose = 'idle', wpn, look = null }) {
  const tier = rarity?.tier ?? 0
  const L = loadoutOf(unit, tier, look)
  const weapon = wpn || L.weapon
  const style = STYLE[weapon] || 'slash'
  const vars = {
    '--glow': GLOW[unit.element] || '#ffd166', '--accent': L.accent,
    '--skin': L.skin[0], '--skinD': L.skin[1], '--hairC': L.hairC, '--hair': L.hairC,
    '--tempo': `${L.tempo}s`,
  }
  return (
    <div className={`ftr crew ftr-${side} ftier-${tier} out-${L.crew} wpn-${weapon} sty-${style} pose-${pose}`} style={vars} aria-hidden="true">
      {tier >= 4 && <div className="f-aura" />}
      <div className="f-shadow" />
      <div className="rig">
        <div className="j j-root">
          <div className="j j-legF far"><Thigh L={L} /><div className="j j-shinF"><Shin L={L} /></div></div>
          <div className="j j-legN"><Thigh L={L} /><div className="j j-shinN"><Shin L={L} /></div></div>
          <div className="j j-torso">
            <div className="j j-armF far">
              <UpperArm L={L} />
              <div className="j j-foreF"><Forearm L={L} /><div className="j j-handF"><Fist /></div></div>
            </div>
            <div className="j j-body"><Torso L={L} tier={tier} /></div>
            <div className="j j-head"><Head L={L} /></div>
            <div className="j j-armN">
              <UpperArm L={L} />
              <div className="j j-foreN"><Forearm L={L} />
                <div className="j j-handN"><Weapon kind={weapon} /><Fist /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
export default memo(Fighter)
