import { memo } from 'react'

// A card on the battlefield becomes a fighter, drawn in side profile like a
// character in an action RPG.
//
// The body is a real rig: hips, torso, head, two arms (shoulder, elbow,
// wrist) and two legs (hip, knee), each joint its own element that turns
// about its own pivot, with parts at different depths inside a slowly turning
// 3D space. Animations move joints, so a fighter plants its feet, winds up,
// swings through and follows through.
//
// Every card gets its own fighter, chosen from the card itself so the same
// card always looks the same: an outfit (knight's plate, scale mail, ranger
// leathers, mage robes, barbarian furs or banded lamellar), its colours, a
// helmet, a weapon, maybe a shield with a sigil and a cape. Rarity decides how
// fine it is: better metal, gold trim, a plume, a glowing aura.

export const OUTFITS = ['plate', 'scale', 'leather', 'robe', 'fur', 'lamellar']
export const OUTFIT_NAMES = { plate: 'Knight plate', scale: 'Scale mail', leather: 'Ranger leathers', robe: 'Battle robes', fur: 'Barbarian furs', lamellar: 'Banded lamellar' }
const COLORS = [
  ['#7d1a1a', '#d2453a'], ['#1b3a80', '#4a7ad6'], ['#1a6034', '#4fbf6a'], ['#46207a', '#9a5ad6'], ['#7a5512', '#e0b84a'],
  ['#1b1b22', '#55556a'], ['#0d5f60', '#3fc4c0'], ['#a9a397', '#f0ece2'], ['#9a4614', '#f08a3a'], ['#58243a', '#b8587e'],
]
const METALS = ['#aab4c2', '#6b7280', '#b27b3b', '#8c96a6']
const GOLD = '#d9b65c'
const SKIN = [['#f3cfaa', '#c99a72'], ['#e2ae80', '#b47e55'], ['#c68a5c', '#94603a'], ['#9a6440', '#6b4026'], ['#6f4529', '#472915']]
const HAIR = ['#24180f', '#5b3a1d', '#a8742e', '#d8c07a', '#16161d', '#7f2716', '#c9ccd4']
const GLOW = { ember: '#ff8a4a', gale: '#b6ff6a', tide: '#6fd6ff' }
const HELMS = {
  plate: ['great', 'sallet', 'crest'], scale: ['nasal', 'horned', 'crest', 'bare'], leather: ['hood', 'feather', 'band', 'bare'],
  robe: ['wizard', 'hood', 'circlet'], fur: ['horned', 'bare', 'band'], lamellar: ['flared', 'nasal', 'crest'],
}
const ARMS = {
  plate: ['sword', 'greatsword', 'mace', 'hammer', 'spear'], scale: ['sword', 'axe', 'spear', 'sabre'], leather: ['bow', 'daggers', 'sabre', 'spear'],
  robe: ['staff', 'flame', 'scythe'], fur: ['axe', 'hammer', 'mace', 'greatsword'], lamellar: ['sabre', 'spear', 'bow', 'sword'],
}
const ONE_HANDED = new Set(['sword', 'axe', 'mace', 'hammer', 'sabre'])
export const WEAPON_NAMES = { sword: 'Longsword', greatsword: 'Greatsword', sabre: 'Sabre', axe: 'Battle axe', spear: 'Spear', hammer: 'War hammer', mace: 'Flanged mace', bow: 'Longbow', staff: 'Hex staff', flame: 'Fire staff', scythe: 'Scythe', banner: 'War banner', daggers: 'Twin daggers' }
// how each weapon fights: run in and slash, thrust, smash overhead, or stay
// back and cast (staffs) or shoot (bows)
export const STYLE = { sword: 'slash', sabre: 'slash', axe: 'slash', scythe: 'slash', daggers: 'slash', spear: 'thrust', hammer: 'smash', mace: 'smash', greatsword: 'smash', banner: 'smash', staff: 'cast', flame: 'cast', bow: 'cast' }

function hash(t) { let h = 2166136261; for (const c of String(t)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const keyOf = (u) => (u.ref ? `${u.ref.kind}:${u.ref.id}` : String(u.id))

// The look of one card's fighter. Everything but the quality comes from the
// card's id, so it never changes between duels.
export function loadoutOf(u, tier = 0) {
  const k = keyOf(u)
  const r = (n, salt) => hash(k + ':' + salt) % n
  const outfit = OUTFITS[r(OUTFITS.length, 'outfit')]
  const c1 = COLORS[r(COLORS.length, 'c1')]
  let c2 = COLORS[r(COLORS.length, 'c2')]
  if (c2 === c1) c2 = COLORS[(COLORS.indexOf(c1) + 3) % COLORS.length]
  const weapon = ARMS[outfit][r(ARMS[outfit].length, 'weapon')]
  const shield = ONE_HANDED.has(weapon) && outfit !== 'robe' && r(3, 'shield') !== 0 ? ['heater', 'round', 'kite'][r(3, 'shape')] : null
  return {
    outfit, weapon, shield, c1, c2,
    helm: HELMS[outfit][r(HELMS[outfit].length, 'helm')],
    metal: tier >= 4 && r(2, 'gold') ? GOLD : METALS[r(METALS.length, 'metal')],
    cape: tier >= 3 || r(3, 'cape') !== 0,
    beard: r(4, 'beard') === 0,
    paint: outfit === 'fur' && r(2, 'paint') === 0,
    sigil: r(6, 'sigil'),
    skin: SKIN[r(SKIN.length, 'skin')], hair: HAIR[r(HAIR.length, 'hair')], hairStyle: r(3, 'hairstyle'),
    tempo: 2.2 + (r(9, 'tempo') / 10),
  }
}
export function weaponFor(u) { return loadoutOf(u).weapon }

const S = (v) => ({ fill: `var(--${v})` })
const Shade = ({ d, g = 'cyl' }) => <path d={d} fill={`url(#fd-${g})`} />

// Shared shading, mounted once per screen. Every part is painted in its own
// flat colour and then shaded with these, so one set of gradients serves every
// fighter whatever its palette.
export function FighterDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="fd-cyl" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".5" /><stop offset=".28" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="fd-vert" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".32" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".5" />
        </linearGradient>
        <linearGradient id="fd-metal" x1="0" x2="1" y1="0" y2=".35">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".22" stopColor="#fff" stopOpacity="0" /><stop offset=".48" stopColor="#000" stopOpacity=".35" />
          <stop offset=".6" stopColor="#fff" stopOpacity=".7" /><stop offset=".72" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".45" />
        </linearGradient>
        <linearGradient id="fd-blade" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".45" stopColor="#c9d3e0" /><stop offset=".55" stopColor="#7d8a9c" /><stop offset="1" stopColor="#dfe7f1" />
        </linearGradient>
        <linearGradient id="fd-wood" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#9a6435" /><stop offset=".5" stopColor="#6e4222" /><stop offset="1" stopColor="#4a2a14" />
        </linearGradient>
        <radialGradient id="fd-skin" cx=".7" cy=".35" r=".8">
          <stop offset="0" stopColor="#fff" stopOpacity=".25" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".35" />
        </radialGradient>
        <radialGradient id="fd-orb" cx=".35" cy=".35" r=".7">
          <stop offset="0" stopColor="#fff" /><stop offset=".35" stopColor="var(--glow)" /><stop offset="1" stopColor="#000" stopOpacity=".6" />
        </radialGradient>
      </defs>
    </svg>
  )
}

// ── parts. Each is drawn in its own little box, pivot at the joint. ──

const SIGILS = [
  'M0 -6 L1.8 -1.8 L6 -1.6 L2.7 1.2 L3.8 5.6 L0 3.1 L-3.8 5.6 L-2.7 1.2 L-6 -1.6 L-1.8 -1.8 Z', // star
  'M-6 -2 L0 4 L6 -2 L6 1.6 L0 7.6 L-6 1.6 Z M-6 -7 L0 -1 L6 -7 L6 -3.4 L0 2.6 L-6 -3.4 Z', // chevrons
  'M-1.6 -7 H1.6 V-1.6 H7 V1.6 H1.6 V7 H-1.6 V1.6 H-7 V-1.6 H-1.6 Z', // cross
  'M0 -3.4 A3.4 3.4 0 1 1 0 3.4 A3.4 3.4 0 1 1 0 -3.4 Z M0 -7.5 L1 -4.6 L-1 -4.6 Z M0 7.5 L1 4.6 L-1 4.6 Z M-7.5 0 L-4.6 1 L-4.6 -1 Z M7.5 0 L4.6 1 L4.6 -1 Z', // sun
  'M2 -6.5 A6.6 6.6 0 1 0 2 6.5 A5 5 0 1 1 2 -6.5 Z', // crescent
  'M0 -7 L5.4 0 L0 7 L-5.4 0 Z', // diamond
]

function Thigh({ L, tier }) {
  const d = 'M2 3 Q8 -1 15 3 L13 32 Q8.5 35 4 32 Z'
  const tasset = L.outfit === 'plate' || L.outfit === 'scale' || L.outfit === 'lamellar' || tier >= 3
  return (
    <svg className="fp" style={{ left: -8, top: -5 }} width="17" height="36" viewBox="0 0 17 36">
      <path d={d} style={S(L.outfit === 'plate' ? 'metal' : L.outfit === 'leather' || L.outfit === 'fur' ? 'leatherD' : 'pants')} /><Shade d={d} g={L.outfit === 'plate' ? 'metal' : 'cyl'} />
      {L.outfit === 'plate' && <path d="M3 18 Q8.5 15.5 14 18 L13.6 22 Q8.5 20 3.4 22 Z" style={S('metal')} stroke="#0007" strokeWidth=".6" />}
      {tasset && L.outfit !== 'plate' && <><path d="M1.5 2 Q8.5 -2 15.5 2 L15 13 Q8.5 16 2 13 Z" style={S(L.outfit === 'lamellar' ? 'c1' : 'metal')} stroke="#0006" strokeWidth=".6" /><Shade d="M1.5 2 Q8.5 -2 15.5 2 L15 13 Q8.5 16 2 13 Z" g="metal" />{L.outfit === 'lamellar' && <path d="M2 6 H15 M2 9.5 H15" stroke="var(--metal)" strokeWidth="1" />}</>}
      {L.outfit === 'fur' && <path d="M2 6 L15 9 M2.4 14 L14.4 17 M3 22 L14 25" stroke="#2a1a0c" strokeWidth="1.2" />}
    </svg>
  )
}
function Shin({ L }) {
  const shin = 'M3 1 L14 1 L13 22 L4 22 Z'
  const boot = 'M2.5 19 L14 19 L14.5 26 Q23 27 24 31 L24 33 L2 33 Z'
  const greave = L.outfit === 'plate' || L.outfit === 'scale'
  return (
    <svg className="fp" style={{ left: -8, top: -3 }} width="26" height="36" viewBox="0 0 26 36">
      <path d={shin} style={S(L.outfit === 'leather' ? 'leather' : 'pants')} /><Shade d={shin} />
      {greave && <><path d="M2.5 2 Q8 0 14.5 2 L13.5 20 L3.5 20 Z" style={S('metal')} stroke="#0006" strokeWidth=".6" /><Shade d="M2.5 2 Q8 0 14.5 2 L13.5 20 L3.5 20 Z" g="metal" /></>}
      {L.outfit === 'leather' && <path d="M2.6 4 Q8 2.6 14.4 4 L14 10 Q8 8.6 2.8 10 Z" style={S('leatherD')} />}
      {L.outfit === 'fur' && <><path d="M1.5 6 Q8 2 15.5 6 L15 20 L2 20 Z" fill="#7a5a36" /><path d="M2 8 L15 11 M2 13 L15 16 M2 18 L15 20" stroke="#3a2410" strokeWidth="1" /><path d="M1.5 6 Q4 3 6 6 Q8 3 10 6 Q12 3 15.5 6" fill="none" stroke="#cdb894" strokeWidth="1.4" /></>}
      <path d={boot} style={S(L.outfit === 'plate' ? 'metal' : 'boot')} /><Shade d={boot} g={L.outfit === 'plate' ? 'metal' : 'vert'} />
      <path d="M2 31.5 L24 31.5 L24 34 L2 34 Z" fill="#120a06" />
      <path d="M3 20.5 L14 20.5" stroke="var(--trim)" strokeWidth="1.2" opacity=".8" />
    </svg>
  )
}
function Torso({ L, tier }) {
  const plate = 'M8 7 Q17 2 25 6 Q32 11 31 22 Q30 31 27 38 L8 38 Q4 26 5 16 Q5.5 9 8 7 Z'
  const skirtLen = L.outfit === 'robe' ? 82 : 54
  const skirt = `M7 37 L28 37 L${L.outfit === 'robe' ? 33 : 31} ${skirtLen} Q18 ${skirtLen + 2} ${L.outfit === 'robe' ? 2 : 4} ${skirtLen} Z`
  const body = { plate: 'metal', scale: 'c1', leather: 'leather', robe: 'c1', fur: 'skin', lamellar: 'c1' }[L.outfit]
  return (
    <svg className="fp" style={{ left: -18, top: -48 }} width="36" height={skirtLen + 4} viewBox={`0 0 36 ${skirtLen + 4}`}>
      {/* skirt: tassets, robe, fur kilt or tunic */}
      <path d={skirt} style={S(L.outfit === 'plate' ? 'metal' : L.outfit === 'fur' ? 'furD' : L.outfit === 'leather' ? 'c1' : 'c1')} /><Shade d={skirt} g={L.outfit === 'plate' ? 'metal' : 'cyl'} />
      {L.outfit === 'plate' && <path d="M7 42 L29 42 M6 47 L30 47" stroke="#0006" strokeWidth=".8" />}
      {L.outfit !== 'plate' && <path d={`M12 39 L11 ${skirtLen} M18 39 L18 ${skirtLen + 1} M24 39 L25 ${skirtLen}`} stroke="#0005" strokeWidth=".8" />}
      {L.outfit === 'robe' && <path d={`M22 37 L25 ${skirtLen}`} stroke="var(--c2)" strokeWidth="2.4" />}
      {/* body */}
      <path d={plate} style={S(body)} /><Shade d={plate} g={L.outfit === 'plate' ? 'metal' : L.outfit === 'fur' ? 'cyl' : 'cyl'} />
      {L.outfit === 'plate' && <><path d="M24 6 Q31 13 28 33" stroke="#fff" strokeOpacity=".55" strokeWidth="1.2" fill="none" /><path d="M8 28 H28 M8 32 H27.5" stroke="#0007" strokeWidth=".9" /></>}
      {L.outfit === 'plate' && tier >= 1 && <><path d="M14 9 L26 8 Q30 16 27 30 L15 30 Z" style={S('c1')} opacity=".95" /><Shade d="M14 9 L26 8 Q30 16 27 30 L15 30 Z" /><path transform="translate(21 18) scale(.62)" d={SIGILS[L.sigil]} style={S('trim')} /></>}
      {L.outfit === 'scale' && Array.from({ length: 6 }, (_, row) => <path key={row} d={Array.from({ length: 6 }, (_, k) => `M${7 + k * 4 + (row % 2) * 2} ${10 + row * 4.4} q2 3 4 0`).join(' ')} fill="none" stroke="var(--metal)" strokeWidth="1.1" />)}
      {L.outfit === 'leather' && <><path d="M9 9 L28 32" stroke="var(--leatherD)" strokeWidth="3" /><rect x="16.5" y="18" width="4" height="4" rx=".6" style={S('trim')} /><path d={plate} fill="none" stroke="#e8d2a8" strokeOpacity=".5" strokeWidth=".6" strokeDasharray="1.2 1.4" /><path d="M8 7 Q17 2 25 6 L23 10 Q16 7 9 11 Z" style={S('c1')} /></>}
      {L.outfit === 'robe' && <><path d="M23 6 Q28 18 26 37" stroke="var(--c2)" strokeWidth="2.2" fill="none" /><path d="M8 7 Q17 2 25 6 L24 11 Q16 8 9 12 Z" style={S('c2')} /></>}
      {L.outfit === 'fur' && <><path d="M9 10 L27 34 M26 9 L11 34" stroke="var(--leatherD)" strokeWidth="2.2" /><circle cx="18.5" cy="21.5" r="2.2" style={S('metal')} /><path d="M27 18 Q24 22 27 26" stroke="#0004" fill="none" /></>}
      {L.outfit === 'lamellar' && [10, 15, 20, 25, 30].map((y) => <g key={y}><path d={`M6 ${y} H30.5`} stroke="var(--metal)" strokeWidth="2.6" /><path d={`M8 ${y} H30`} stroke="var(--c2)" strokeWidth=".7" strokeDasharray=".8 2.6" /></g>)}
      {/* fur mantle over the shoulders */}
      {L.outfit === 'fur' && <path d="M5 13 Q4 4 12 3 Q20 1 27 5 Q31 8 30 13 Q27 10 25 13 Q22 9 19 12 Q16 8 13 12 Q10 9 8 13 Q6 10 5 13 Z" style={S('fur')} />}
      {tier >= 3 && L.outfit !== 'fur' && <path d={plate} fill="none" style={{ stroke: 'var(--trim)' }} strokeWidth="1.1" />}
      {/* belt */}
      <path d="M7 34 L29 34 L29 39 L7 39 Z" fill="#2a1a10" />
      <rect x="21" y="33.5" width="5" height="6" rx="1" style={S('trim')} />
      {L.outfit === 'leather' && <rect x="9" y="38" width="5" height="6" rx="1" style={S('leatherD')} />}
    </svg>
  )
}
function Head({ L, tier }) {
  const helm = L.helm
  const hairShown = !['great', 'sallet', 'hood', 'wizard'].includes(helm)
  const face = 'M14.5 2 Q25 2 25.5 11 L28 16.5 Q28.3 17.6 26.5 18 L25.8 18.2 Q26 21 24 23.5 Q20 26.5 14.5 25.5 Q8 24 5.6 17 Q3.6 9 8 4.6 Q10.8 2 14.5 2 Z'
  return (
    <svg className="fp" style={{ left: -15, top: -45 }} width="34" height="50" viewBox="-2 -14 34 50">
      {L.hairStyle === 2 && hairShown && <path d="M5 9 Q2 22 6 31 L12 28 Q9 20 11 12 Z" style={S('hair')} />}
      {helm === 'hood' && <path d="M2 18 Q-1 2 14 -1 Q27 -1 27.4 9 L26 26 L10 33 Q3 28 2 18 Z" style={S('c1')} />}
      <path d="M10 22 L18 22 L19 33 L9 33 Z" style={S('skin')} /><path d="M10 22 L18 22 L19 33 L9 33 Z" fill="#000" opacity=".22" />
      <path d={face} style={S('skin')} /><path d={face} fill="url(#fd-skin)" />
      <path d="M11.6 11 Q9 11 9.2 14.5 Q9.4 17.5 12 17.6 Q12.8 14 11.6 11 Z" style={S('skinD')} />
      <path d="M20.2 11.2 Q22.6 10.2 24.4 11.6 Q22.5 13 20.2 11.2 Z" fill="#f4f1ea" />
      <circle cx="22.7" cy="11.6" r="1" fill="#1b1410" />
      <path d="M19.6 9.4 Q22.4 8 25.2 9.6" stroke="var(--hair)" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M22.6 20.6 Q24.4 20.9 25.4 20.2" stroke="#6b3a28" strokeWidth=".8" fill="none" strokeLinecap="round" />
      {L.paint && <path d="M17 9 L27 12.6 L26.6 14.4 L17 11.6 Z" style={S('c2')} opacity=".9" />}
      {L.beard && <path d="M13 19 Q14 27 20 27.6 Q25 26.6 25.8 21 Q24 23.6 21 23 Q17 22.6 15 19 Z" style={S('hair')} />}
      {hairShown && (L.hairStyle === 1
        ? <path d="M6 13 Q3 3 13 1.2 Q22 0.4 25.5 7 Q22 4.6 18.5 6.4 Q16 4.8 14 7.2 Q12 9 11.4 12.6 Q8 13 6 13 Z" style={S('hair')} />
        : <path d="M5.4 15 Q3.4 4 13 1.4 Q21.5 0 25.2 6.8 Q20 5.4 16.5 7 Q13 8.6 12 12.4 Q8 12.4 7.4 16 Z" style={S('hair')} />)}
      {helm === 'band' && <path d="M5 9.4 Q15 4.6 25.4 7.4 L25.4 9.6 Q15 7 5.4 11.8 Z" style={S('c2')} />}
      {helm === 'circlet' && <><path d="M5 9 Q15 5 25.4 7.2" stroke={GOLD} strokeWidth="1.4" fill="none" /><circle cx="24.4" cy="7.4" r="1.4" style={S('glow')} /></>}
      {helm === 'feather' && <><path d="M4 11 Q4 0 15 -0.6 Q25 0 26.6 7.6 L4 11 Z" style={S('c1')} /><path d="M2 10.6 L28 7" stroke="var(--c2)" strokeWidth="1.6" /><path d="M6 4 Q-6 -10 -1 -12 Q4 -4 8 4 Z" style={S('c2')} /></>}
      {helm === 'hood' && <path d="M4 16 Q2 1 14 0 Q26 0 27 10 Q22 4 16 5 Q9 7 8 16 Z" style={S('c1')} />}
      {helm === 'hood' && <Shade d="M2 18 Q-1 2 14 -1 Q27 -1 27.4 9 Q22 4 16 5 Q9 7 8 16 Z" />}
      {helm === 'wizard' && <><path d="M1 8 Q14 2 30 6 L28 9 Q14 6 3 11 Z" style={S('c1')} /><path d="M6 7.4 Q8 -4 18 -8 Q15 -12 24 -14 Q20 -8 22 5.6 Z" style={S('c1')} /><Shade d="M6 7.4 Q8 -4 18 -8 Q15 -12 24 -14 Q20 -8 22 5.6 Z" /><path d="M5.6 6.4 Q14 3.4 22.6 5" stroke="var(--c2)" strokeWidth="1.8" fill="none" /></>}
      {(helm === 'nasal' || helm === 'horned' || helm === 'crest' || helm === 'flared') && <>
        <path d="M4.6 13 Q3.6 0.4 15 0.2 Q26 0.4 26 9.4 L23.4 9.6 L23.6 15.4 L22 15.6 L21.6 9.8 Q14 9 6.2 13.6 Z" style={S('metal')} />
        <Shade d="M4.6 13 Q3.6 0.4 15 0.2 Q26 0.4 26 9.4 L23.4 9.6 L23.6 15.4 L22 15.6 L21.6 9.8 Q14 9 6.2 13.6 Z" g="metal" />
        <path d="M5 12.6 Q14 8.4 26 9.4" style={{ stroke: 'var(--trim)' }} strokeWidth="1.1" fill="none" />
      </>}
      {helm === 'flared' && <path d="M1 12 Q3 21 9 23 L10 15 Q6 15 4.8 11 Z" style={S('metal')} stroke="#0006" strokeWidth=".6" />}
      {helm === 'horned' && <><path d="M8 4 Q0 2 -1 -8 Q4 -2 11 1.6 Z" fill="#efe6d2" stroke="#8a7a5a" strokeWidth=".6" /><path d="M20 1 Q25 -6 21 -12 Q29 -6 24 2.4 Z" fill="#efe6d2" stroke="#8a7a5a" strokeWidth=".6" /></>}
      {helm === 'crest' && <path d="M6 2 Q14 -9 25 1 Q20 -2 15 -1 Q10 0 6 4 Z" style={S('c2')} />}
      {(helm === 'great' || helm === 'sallet') && <>
        <path d={helm === 'great' ? 'M4 16 Q3 -0.6 15 -0.6 Q27.6 0 27.6 12 L28.6 17.8 Q27 23 21.6 25.6 L9 25.6 Q4.6 22 4 16 Z' : 'M2 15 Q2 -1 15 -0.8 Q27.4 0 28 12 L29 16 L22 16.6 L21.6 13 L6 15 L5 19 Q3 19 2 15 Z'} style={S('metal')} />
        <Shade d={helm === 'great' ? 'M4 16 Q3 -0.6 15 -0.6 Q27.6 0 27.6 12 L28.6 17.8 Q27 23 21.6 25.6 L9 25.6 Q4.6 22 4 16 Z' : 'M2 15 Q2 -1 15 -0.8 Q27.4 0 28 12 L29 16 L22 16.6 L21.6 13 L6 15 L5 19 Q3 19 2 15 Z'} g="metal" />
        <path d="M18.4 10.6 L28 10.2 L28 12.6 L18.6 12.8 Z" fill="#06070a" />
        {helm === 'great' && <path d="M21 16 L27.4 15.8 M21 18.4 L27 18.2 M16.4 25.6 L16.4 -0.4" stroke="#06070a" strokeWidth=".9" />}
        <path d="M4.6 14 Q14 7.8 27.8 10" style={{ stroke: 'var(--trim)' }} strokeWidth="1.2" fill="none" />
      </>}
      {tier >= 4 && ['great', 'sallet', 'nasal', 'crest', 'flared'].includes(helm) && <path d="M14 0 Q10 -12 -1 -9 Q6 -7 4 -3 Q9 -5 8 1 Q11 -2 14 0 Z" style={S('c2')} />}
    </svg>
  )
}
function UpperArm({ L, tier }) {
  const arm = 'M3 5 Q8.5 1 14 5 L12.5 28 Q8.5 31 4.5 28 Z'
  const sleeve = { plate: 'metal', scale: 'c1', leather: 'c1', robe: 'c1', fur: 'skin', lamellar: 'c1' }[L.outfit]
  return (
    <svg className="fp" style={{ left: -8, top: -7 }} width="17" height="32" viewBox="0 0 17 32">
      {L.outfit === 'robe' ? <path d="M2 4 Q8.5 0 15 4 L16 28 Q8.5 32 1 28 Z" style={S('c1')} /> : <path d={arm} style={S(sleeve)} />}
      <Shade d={arm} g={L.outfit === 'plate' ? 'metal' : 'cyl'} />
      {L.outfit === 'fur' && <path d="M3 18 L14 20 M3.4 21 L13.6 23" stroke="var(--leatherD)" strokeWidth="1.4" />}
      {L.outfit === 'robe' && <path d="M1 26 Q8.5 30 16 26" stroke="var(--c2)" strokeWidth="1.6" fill="none" />}
      {L.outfit === 'fur'
        ? <path d="M0 10 Q-1 1 8.5 0 Q17 1 17 10 Q14 7 12 10 Q10 6 8 10 Q6 6 4 10 Q2 7 0 10 Z" style={S('fur')} />
        : L.outfit === 'lamellar'
          ? <>{[2, 6, 10].map((y) => <path key={y} d={`M0.6 ${y} Q8.5 ${y - 3} 16.4 ${y} L16.4 ${y + 3.6} Q8.5 ${y + 0.6} 0.6 ${y + 3.6} Z`} style={S('metal')} stroke="#0007" strokeWidth=".5" />)}</>
          : L.outfit !== 'robe' && <><path d="M0.6 9 Q0 0.6 8.5 0.4 Q16.6 0.6 16.4 9 Q12 7 8.5 7.6 Q4.6 7 0.6 9 Z" style={S(L.outfit === 'leather' ? 'leatherD' : 'metal')} /><Shade d="M0.6 9 Q0 0.6 8.5 0.4 Q16.6 0.6 16.4 9 Q12 7 8.5 7.6 Q4.6 7 0.6 9 Z" g="metal" />
            {L.outfit === 'plate' && L.sigil % 2 === 0 && <path d="M8.5 0.6 L10 -4 L11 1" style={S('metal')} />}</>}
      {tier >= 3 && L.outfit !== 'fur' && L.outfit !== 'robe' && <path d="M0.8 8.6 Q4.6 6.6 8.5 7.2 Q12 6.6 16.2 8.6" style={{ stroke: 'var(--trim)' }} strokeWidth="1" fill="none" />}
    </svg>
  )
}
function Forearm({ L }) {
  const d = 'M2.5 1 L12.5 1 L11 21 L4 21 Z'
  const bracer = 'M2 6 L13 6 L11.8 21 L3.2 21 Z'
  return (
    <svg className="fp" style={{ left: -7, top: -3 }} width="15" height="28" viewBox="0 0 15 28">
      <path d={d} style={S(L.outfit === 'fur' || L.outfit === 'robe' ? 'skin' : L.outfit === 'plate' ? 'metal' : 'c1')} /><Shade d={d} />
      {L.outfit === 'robe'
        ? <path d="M0 0 L15 0 L15.5 10 Q7.5 13 -0.5 10 Z" style={S('c1')} />
        : <><path d={bracer} style={S(L.outfit === 'plate' || L.outfit === 'scale' || L.outfit === 'lamellar' ? 'metal' : 'leatherD')} /><Shade d={bracer} g={L.outfit === 'leather' || L.outfit === 'fur' ? 'cyl' : 'metal'} /></>}
      {L.outfit === 'fur' && <path d="M2.4 9 L12.6 11 M2.6 13 L12.4 15 M2.8 17 L12 19" stroke="#2a1a0c" strokeWidth="1" />}
      {L.outfit !== 'robe' && <path d="M2.4 7.4 L12.6 7.4" style={{ stroke: 'var(--trim)' }} strokeWidth="1" opacity=".8" />}
    </svg>
  )
}
function Fist({ L }) {
  const d = 'M1.4 2.6 Q5.5 -0.4 9.6 2.6 L9.8 7.6 Q5.5 10.6 1.2 7.6 Z'
  return (
    <svg className="fp" style={{ left: -5.5, top: -5 }} width="11" height="11" viewBox="0 0 11 11">
      <path d={d} style={S(L.outfit === 'plate' ? 'metal' : L.outfit === 'robe' || L.outfit === 'fur' ? 'skin' : 'glove')} /><Shade d={d} />
      <path d="M2.6 4.2 L8.6 4.2 M2.6 6.2 L8.6 6.2" stroke="#0005" strokeWidth=".6" />
    </svg>
  )
}

// Weapons are drawn with the grip at (G, 20) and the business end along +x.
const G = 18
function Weapon({ kind }) {
  const box = { sword: [70, 40], greatsword: [96, 40], sabre: [66, 40], axe: [62, 40], spear: [96, 40], hammer: [62, 40], mace: [60, 40], bow: [44, 72], staff: [80, 40], flame: [80, 40], scythe: [84, 50], banner: [84, 56], daggers: [42, 40] }[kind] || [70, 40]
  let body
  switch (kind) {
    case 'axe': body = <>
      <rect x="4" y="18.4" width="50" height="3.4" rx="1.4" fill="url(#fd-wood)" />
      <path d="M40 19 Q42 6 54 4 Q60 14 58 20 Q60 27 54 36 Q42 34 40 21 Z" fill="url(#fd-blade)" stroke="#5c6878" strokeWidth=".8" />
      <path d="M54 4 Q60 14 58 20 Q60 27 54 36" fill="none" stroke="#fff" strokeWidth="1.2" />
      <rect x="38" y="17" width="5" height="6" fill="var(--trim)" />
    </>; break
    case 'spear': body = <>
      <rect x="0" y="18.8" width="80" height="2.6" rx="1.2" fill="url(#fd-wood)" />
      <path d="M78 16.6 L94 20 L78 23.4 L80 20 Z" fill="url(#fd-blade)" stroke="#5c6878" strokeWidth=".6" />
      <rect x="75" y="17.4" width="4" height="5.2" fill="var(--trim)" />
      <path d="M74 20 Q70 27 72 32" style={{ stroke: 'var(--c2)' }} strokeWidth="1.6" fill="none" />
    </>; break
    case 'hammer': body = <>
      <rect x="4" y="18.4" width="44" height="3.6" rx="1.4" fill="url(#fd-wood)" />
      <rect x="42" y="6" width="16" height="28" rx="2" style={S('metal')} stroke="#3e4652" strokeWidth=".8" />
      <rect x="42" y="6" width="16" height="28" rx="2" fill="url(#fd-metal)" />
      <rect x="42" y="18" width="16" height="4" fill="var(--trim)" />
    </>; break
    case 'mace': body = <>
      <rect x="6" y="18.4" width="40" height="3.4" rx="1.4" fill="#3a2a20" />
      <path d="M44 20 L48 10 L52 20 L48 30 Z M44 20 L56 16 L60 20 L56 24 Z M46 13 L56 12 L52 20 Z M46 27 L56 28 L52 20 Z" style={S('metal')} stroke="#2e3440" strokeWidth=".6" />
      <circle cx="51" cy="20" r="5.4" style={S('metal')} /><circle cx="51" cy="20" r="5.4" fill="url(#fd-orb)" opacity=".35" />
      <rect x="10" y="17.6" width="6" height="5" fill="var(--trim)" />
    </>; break
    case 'greatsword': body = <>
      <rect x="2" y="18" width="16" height="4" rx="1.4" fill="#2a1a10" />
      <circle cx="2" cy="20" r="2.6" fill="var(--trim)" />
      <rect x="18" y="11" width="4" height="18" rx="1" fill="var(--trim)" />
      <path d="M22 16.6 L86 17.6 L95 20 L86 22.4 L22 23.4 Z" fill="url(#fd-blade)" stroke="#5c6878" strokeWidth=".6" />
      <path d="M23 20 L86 20" stroke="#7d8a9c" strokeWidth=".8" />
    </>; break
    case 'sabre': body = <>
      <rect x="9" y="18.2" width="10" height="3.6" rx="1" fill="#2a1a10" />
      <path d="M8 17 Q4 20 8 23 L19 23" fill="none" stroke="var(--trim)" strokeWidth="1.4" />
      <rect x="18.6" y="15" width="2.8" height="10" rx="1" fill="var(--trim)" />
      <path d="M21 18 Q44 17 64 10 Q50 20 21 22.4 Z" fill="url(#fd-blade)" stroke="#5c6878" strokeWidth=".6" />
    </>; break
    case 'bow': body = <>
      <path d="M8 2 Q27 36 8 70" fill="none" stroke="#5a3418" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M8 2 Q27 36 8 70" fill="none" stroke="#b07a40" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8 2 L8 70" stroke="#ece6d4" strokeWidth=".7" />
      <rect x="14.5" y="32" width="5" height="8" rx="1.2" style={S('c2')} />
    </>; break
    case 'staff': body = <>
      <rect x="0" y="18.6" width="66" height="2.8" rx="1.2" fill="#3f2558" />
      <path d="M62 14 Q70 12 72 20 Q70 28 62 26" fill="none" stroke="var(--trim)" strokeWidth="1.4" />
      <circle cx="71" cy="20" r="5.6" fill="url(#fd-orb)" />
      <circle cx="71" cy="20" r="9" fill="var(--glow)" opacity=".28" className="w-glow" />
    </>; break
    case 'flame': body = <>
      <rect x="0" y="18.6" width="64" height="2.8" rx="1.2" fill="url(#fd-wood)" />
      <rect x="60" y="16.6" width="5" height="6.8" fill="var(--trim)" />
      <path d="M64 20 Q70 8 79 13 Q74 15 76 20 Q74 25 79 27 Q70 32 64 20 Z" fill="#ff6a2a" className="w-glow" />
      <path d="M65 20 Q70 14 74 17 Q71 20 74 23 Q70 26 65 20 Z" fill="#ffd56a" />
    </>; break
    case 'scythe': body = <>
      <rect x="0" y="23.6" width="76" height="2.8" rx="1.2" fill="#3a2620" />
      <path d="M72 24 Q78 6 60 2 Q46 0 38 8 Q52 5 62 12 Q68 17 70 25 Z" fill="url(#fd-blade)" stroke="#5c6878" strokeWidth=".7" />
      <path d="M38 8 Q52 5 62 12 Q68 17 70 25" fill="none" stroke="#fff" strokeWidth="1" />
    </>; break
    case 'banner': body = <>
      <rect x="0" y="26.6" width="80" height="2.8" rx="1.2" fill="url(#fd-wood)" />
      <circle cx="80" cy="28" r="2.6" fill="var(--trim)" />
      <path d="M76 29 L76 54 L64 50 L52 54 L52 29 Z" style={S('c2')} stroke="#0006" strokeWidth=".7" />
      <path d="M76 29 L76 54 L64 50 L52 54 L52 29 Z" fill="url(#fd-cyl)" />
    </>; break
    case 'daggers': body = <>
      <rect x="10" y="18.4" width="10" height="3.4" rx="1" fill="#2a1a10" />
      <rect x="19" y="15.6" width="2.6" height="9" fill="var(--trim)" />
      <path d="M21.4 17.6 L38 20 L21.4 22.6 Z" fill="url(#fd-blade)" stroke="#5c6878" strokeWidth=".6" />
    </>; break
    default: body = <>
      <rect x="9" y="18.2" width="11" height="3.6" rx="1" fill="#2a1a10" />
      <circle cx="8.6" cy="20" r="2.4" fill="var(--trim)" />
      <rect x="20" y="13" width="3.2" height="14" rx="1" fill="var(--trim)" />
      <path d="M23 17.6 L62 18.6 L68 20 L62 21.4 L23 22.4 Z" fill="url(#fd-blade)" stroke="#5c6878" strokeWidth=".6" />
      <path d="M24 20 L62 20" stroke="#8592a3" strokeWidth=".7" />
    </>
  }
  const top = kind === 'bow' ? -36 : -20
  return (
    <svg className={`fp weapon wpn-${kind}`} style={{ left: -G, top }} width={box[0]} height={box[1]} viewBox={`0 0 ${box[0]} ${box[1]}`}>
      {body}
    </svg>
  )
}
// shields are held edge-on in front of the chest, painted with the sigil
function Shield({ L, tier }) {
  const shape = {
    heater: 'M2 3 Q9 -0.6 16 3 L16 22 Q16 34 9 41 Q2 34 2 22 Z',
    round: 'M9 0 Q18 0 18 20.5 Q18 41 9 41 Q0 41 0 20.5 Q0 0 9 0 Z',
    kite: 'M2 4 Q9 -1 16 4 L15 18 Q13 32 9 45 Q5 32 3 18 Z',
  }[L.shield]
  return (
    <div className="f-shield" aria-hidden="true">
      <svg className="fp" style={{ left: -9, top: -21 }} width="18" height="46" viewBox="0 0 18 46">
        <path d={shape} style={S(tier >= 2 ? 'metal' : 'leatherD')} stroke="#0008" strokeWidth=".8" />
        <path d={shape} style={S('c1')} transform="translate(9 21) scale(.84) translate(-9 -21)" /><Shade d={shape} />
        <path transform="translate(9 19) scale(.62 .9)" d={SIGILS[L.sigil]} style={S('c2')} />
        {L.shield === 'round' && <circle cx="9" cy="20.5" r="2.6" style={S('metal')} />}
        <path d={shape} fill="none" style={{ stroke: 'var(--trim)' }} strokeWidth="1.2" />
      </svg>
    </div>
  )
}

function Fighter({ unit, art, rarity, side, pose = 'idle', wpn }) {
  const tier = rarity?.tier ?? 0
  const L = loadoutOf(unit, tier)
  const weapon = wpn || L.weapon
  const style = STYLE[weapon] || 'slash'
  const vars = {
    '--c1': L.c1[0], '--c2': L.c2[1], '--glow': GLOW[unit.element] || '#ffd166',
    '--skin': L.skin[0], '--skinD': L.skin[1], '--hair': L.hair, '--metal': L.metal,
    '--trim': tier >= 3 ? GOLD : tier >= 2 ? '#d7dde6' : '#9a7a52',
    '--leather': '#6a4527', '--leatherD': '#3f2614', '--pants': '#2e2a2a', '--boot': '#3b2616', '--glove': '#4a3020', '--fur': '#8a6a46', '--furD': '#5a4028',
    '--tempo': `${L.tempo}s`,
  }
  return (
    <div className={`ftr ftr-${side} ftier-${tier} out-${L.outfit} wpn-${weapon} sty-${style} pose-${pose}`} style={vars} aria-hidden="true">
      {tier >= 4 && <div className="f-aura" />}
      <div className="f-shadow" />
      <div className="rig">
        <div className="j j-root">
          <div className="j j-legF far"><Thigh L={L} tier={tier} /><div className="j j-shinF"><Shin L={L} /></div></div>
          <div className="j j-legN"><Thigh L={L} tier={tier} /><div className="j j-shinN"><Shin L={L} /></div></div>
          <div className="j j-torso">
            {L.cape && <div className="j j-cape">
              <svg className="fp" style={{ left: -6, top: 0 }} width="18" height="56" viewBox="0 0 18 56">
                <path d="M10 0 Q16 2 14 12 Q12 32 17 54 L1 52 Q-1 30 4 10 Q6 2 10 0 Z" style={S('c2')} />
                <path d="M10 0 Q16 2 14 12 Q12 32 17 54 L1 52 Q-1 30 4 10 Q6 2 10 0 Z" fill="url(#fd-cyl)" />
                <path d="M1 52 L17 54" style={{ stroke: 'var(--trim)' }} strokeWidth="1.4" />
              </svg>
            </div>}
            <div className="j j-armF far">
              <UpperArm L={L} tier={tier} />
              <div className="j j-foreF"><Forearm L={L} />
                <div className="j j-handF">{L.shield ? <Shield L={L} tier={tier} /> : weapon === 'daggers' ? <Weapon kind="daggers" /> : null}<Fist L={L} /></div>
              </div>
            </div>
            <div className="j j-body"><Torso L={L} tier={tier} /></div>
            <div className="j j-head"><Head L={L} tier={tier} /></div>
            <div className="j j-armN">
              <UpperArm L={L} tier={tier} />
              <div className="j j-foreN"><Forearm L={L} />
                <div className="j j-handN"><Weapon kind={weapon} /><Fist L={L} /></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
export default memo(Fighter)
