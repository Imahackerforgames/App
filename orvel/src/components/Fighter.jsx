import { memo } from 'react'

// A card on the battlefield becomes a fighter, drawn in side profile like a
// character in an action RPG.
//
// The body is a real rig: hips, torso, head, two arms (shoulder, elbow,
// wrist) and two legs (hip, knee), each joint its own element that turns
// about its own pivot. Animations move joints, not the whole picture, so a
// fighter plants its feet, winds up, swings through and follows through.
//
// Parts also sit at different depths (far arm and leg behind the body, weapon
// arm in front) inside a 3D space that slowly turns, so the figure has real
// volume rather than being a flat cut-out.
//
// Looks come from the card: armour colour from its element, armour weight and
// trim from its rarity, weapon from its strongest trait, and the card's own
// artwork on the shield or chest emblem. Skin and hair vary per card.

const PALETTE = {
  ember: { armor: '#a7351d', armorL: '#e0653a', cloth: '#4d1610', glow: '#ff8a4a' },
  gale: { armor: '#2e7330', armorL: '#6fc25a', cloth: '#1b3a1a', glow: '#b6ff6a' },
  tide: { armor: '#1f4f96', armorL: '#4f8fe0', cloth: '#12284f', glow: '#6fd6ff' },
}
const SKIN = [['#f3cfaa', '#c99a72'], ['#e2ae80', '#b47e55'], ['#c68a5c', '#94603a'], ['#9a6440', '#6b4026'], ['#6f4529', '#472915']]
const HAIR = ['#24180f', '#5b3a1d', '#a8742e', '#d8c07a', '#16161d', '#7f2716', '#c9ccd4']
const BY_ABILITY = { pierce: 'spear', burn: 'flame', drain: 'scythe', counter: 'sword', hex: 'staff', rally: 'banner', surge: 'daggers', shield: 'hammer' }
export const WEAPON_NAMES = { sword: 'Longsword', axe: 'Battle axe', spear: 'Spear', hammer: 'War hammer', staff: 'Hex staff', flame: 'Fire staff', scythe: 'Scythe', banner: 'War banner', daggers: 'Twin daggers' }
// how each weapon fights: run in and slash, run in and thrust, run in and
// smash overhead, or stay back and cast
export const STYLE = { sword: 'slash', axe: 'slash', scythe: 'slash', daggers: 'slash', spear: 'thrust', hammer: 'smash', banner: 'smash', staff: 'cast', flame: 'cast' }

export function weaponFor(u) {
  const a = u.abilities?.find((x) => BY_ABILITY[x])
  if (a) return BY_ABILITY[a]
  return u.atk >= u.hp ? 'axe' : 'sword'
}
const shieldFor = (u, w) => (w === 'sword' || w === 'hammer' || w === 'axe') && (u.abilities?.includes('shield') || u.abilities?.includes('counter') || u.hp >= u.atk + 2 || w === 'hammer')

function hash(t) { let h = 2166136261; for (const c of String(t)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }

const S = (v) => ({ fill: `var(--${v})` })

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

function Thigh({ tier }) {
  return (
    <svg className="fp" style={{ left: -8, top: -5 }} width="17" height="36" viewBox="0 0 17 36">
      <path d="M2 3 Q8 -1 15 3 L13 32 Q8.5 35 4 32 Z" style={S('legs')} />
      <path d="M2 3 Q8 -1 15 3 L13 32 Q8.5 35 4 32 Z" fill="url(#fd-cyl)" />
      {tier >= 2 && <path d="M1.5 2 Q8.5 -2 15.5 2 L15 13 Q8.5 16 2 13 Z" style={S('metal')} stroke="#0006" strokeWidth=".6" />}
      {tier >= 2 && <path d="M1.5 2 Q8.5 -2 15.5 2 L15 13 Q8.5 16 2 13 Z" fill="url(#fd-metal)" />}
    </svg>
  )
}
function Shin({ tier }) {
  return (
    <svg className="fp" style={{ left: -8, top: -3 }} width="26" height="36" viewBox="0 0 26 36">
      <path d="M3 1 L14 1 L13 22 L4 22 Z" style={S('legs')} />
      <path d="M3 1 L14 1 L13 22 L4 22 Z" fill="url(#fd-cyl)" />
      {tier >= 1 && <><path d="M2.5 2 Q8 0 14.5 2 L13.5 20 L3.5 20 Z" style={S(tier >= 3 ? 'metal' : 'leather')} stroke="#0006" strokeWidth=".6" /><path d="M2.5 2 Q8 0 14.5 2 L13.5 20 L3.5 20 Z" fill={tier >= 3 ? 'url(#fd-metal)' : 'url(#fd-cyl)'} /></>}
      {/* boot, toe pointing forward */}
      <path d="M2.5 19 L14 19 L14.5 26 Q23 27 24 31 L24 33 L2 33 Z" style={S('boot')} />
      <path d="M2.5 19 L14 19 L14.5 26 Q23 27 24 31 L24 33 L2 33 Z" fill="url(#fd-vert)" />
      <path d="M2 31.5 L24 31.5 L24 34 L2 34 Z" fill="#120a06" />
      <path d="M3 20.5 L14 20.5" stroke="var(--trim)" strokeWidth="1.2" opacity=".8" />
    </svg>
  )
}
function Torso({ tier, art }) {
  const plate = 'M8 7 Q17 2 25 6 Q32 11 31 22 Q30 31 27 38 L8 38 Q4 26 5 16 Q5.5 9 8 7 Z'
  return (
    <svg className="fp" style={{ left: -18, top: -48 }} width="36" height="56" viewBox="0 0 36 56">
      {/* tunic skirt */}
      <path d="M7 37 L28 37 L31 54 Q18 56 4 54 Z" style={S('cloth')} />
      <path d="M7 37 L28 37 L31 54 Q18 56 4 54 Z" fill="url(#fd-cyl)" />
      <path d="M12 39 L11 54 M18 39 L18 55 M24 39 L25 54" stroke="#0005" strokeWidth=".8" />
      {/* body armour */}
      <path d={plate} style={S(tier >= 2 ? 'armor' : 'leather')} />
      <path d={plate} fill="url(#fd-cyl)" />
      {tier >= 2 && <path d="M15 7 Q26 6 29 16 Q29 25 26 33 Q22 22 15 7 Z" style={S('metal')} opacity=".95" />}
      {tier >= 2 && <path d="M15 7 Q26 6 29 16 Q29 25 26 33 Q22 22 15 7 Z" fill="url(#fd-metal)" />}
      {tier < 2 && <path d="M10 12 Q17 10 27 14 M9 20 Q18 18 29 22 M9 28 Q18 26 28 30" stroke="#0004" strokeWidth=".9" fill="none" />}
      <path d={plate} fill="none" stroke="var(--trim)" strokeWidth={tier >= 3 ? 1.2 : 0.6} opacity={tier >= 3 ? 1 : 0.5} />
      {/* belt */}
      <path d="M7 34 L29 34 L29 39 L7 39 Z" fill="#2a1a10" />
      <rect x="21" y="33.5" width="5" height="6" rx="1" style={S('trim')} />
      {/* chest emblem with the card's art, when there is no shield to carry it */}
      {art && <g><circle cx="22" cy="19" r="5.4" fill="#0008" /><circle cx="22" cy="19" r="4.6" style={S('trim')} /></g>}
    </svg>
  )
}
function Head({ tier, hairStyle, h }) {
  const helm = tier >= 4 ? 'full' : tier >= 2 ? 'nasal' : tier === 1 ? 'band' : 'none'
  return (
    <svg className="fp" style={{ left: -13, top: -31 }} width="30" height="36" viewBox="0 0 30 36">
      {/* long hair falls behind */}
      {hairStyle === 2 && helm !== 'full' && <path d="M5 9 Q2 22 6 31 L12 28 Q9 20 11 12 Z" style={S('hair')} />}
      {/* neck */}
      <path d="M10 22 L18 22 L19 33 L9 33 Z" style={S('skin')} /><path d="M10 22 L18 22 L19 33 L9 33 Z" fill="#000" opacity=".22" />
      {/* skull, jaw, nose: a profile facing right */}
      <path d="M14.5 2 Q25 2 25.5 11 L28 16.5 Q28.3 17.6 26.5 18 L25.8 18.2 Q26 21 24 23.5 Q20 26.5 14.5 25.5 Q8 24 5.6 17 Q3.6 9 8 4.6 Q10.8 2 14.5 2 Z" style={S('skin')} />
      <path d="M14.5 2 Q25 2 25.5 11 L28 16.5 Q28.3 17.6 26.5 18 L25.8 18.2 Q26 21 24 23.5 Q20 26.5 14.5 25.5 Q8 24 5.6 17 Q3.6 9 8 4.6 Q10.8 2 14.5 2 Z" fill="url(#fd-skin)" />
      {/* ear */}
      <path d="M11.6 11 Q9 11 9.2 14.5 Q9.4 17.5 12 17.6 Q12.8 14 11.6 11 Z" style={S('skinD')} />
      {/* eye, brow, mouth */}
      <path d="M20.2 11.2 Q22.6 10.2 24.4 11.6 Q22.5 13 20.2 11.2 Z" fill="#f4f1ea" />
      <circle cx="22.7" cy="11.6" r="1" fill="#1b1410" />
      <path d="M19.6 9.4 Q22.4 8 25.2 9.6" stroke={'var(--hair)'} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <path d="M22.6 20.6 Q24.4 20.9 25.4 20.2" stroke="#6b3a28" strokeWidth=".8" fill="none" strokeLinecap="round" />
      <path d="M25.8 18.2 Q24.5 18.8 23.6 18" stroke="var(--skinD)" strokeWidth=".7" fill="none" />
      {(h % 3 === 0) && <path d="M15 21 Q18 25.5 24 23.4 Q20 24.4 17 22 Z" style={S('hair')} opacity=".85" />}
      {/* hair */}
      {helm !== 'full' && (
        hairStyle === 1
          ? <path d="M6 13 Q3 3 13 1.2 Q22 0.4 25.5 7 Q22 4.6 18.5 6.4 Q16 4.8 14 7.2 Q12 9 11.4 12.6 Q8 13 6 13 Z" style={S('hair')} />
          : <path d="M5.4 15 Q3.4 4 13 1.4 Q21.5 0 25.2 6.8 Q20 5.4 16.5 7 Q13 8.6 12 12.4 Q8 12.4 7.4 16 Z" style={S('hair')} />
      )}
      {helm !== 'full' && <path d="M5.4 15 Q3.4 4 13 1.4 Q21.5 0 25.2 6.8" fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="1" />}
      {helm === 'band' && <><path d="M5 9.4 Q15 4.6 25.4 7.4 L25.4 9.6 Q15 7 5.4 11.8 Z" style={S('armor')} /><path d="M5.6 11 Q2 14 3 18 L5.8 13 Z" style={S('armor')} /></>}
      {helm === 'nasal' && <>
        <path d="M4.6 13 Q3.6 0.4 15 0.2 Q26 0.4 26 9.4 L23.4 9.6 L23.6 15.4 L22 15.6 L21.6 9.8 Q14 9 6.2 13.6 Z" style={S('metal')} />
        <path d="M4.6 13 Q3.6 0.4 15 0.2 Q26 0.4 26 9.4 L23.4 9.6 L23.6 15.4 L22 15.6 L21.6 9.8 Q14 9 6.2 13.6 Z" fill="url(#fd-metal)" />
        <path d="M5 12.6 Q14 8.4 26 9.4" stroke="var(--trim)" strokeWidth="1.1" fill="none" />
      </>}
      {helm === 'full' && <>
        <path d="M4 15 Q3 -0.6 15 -0.6 Q27.6 0 27.6 12 L28.6 17.8 Q27 23 21.6 25.6 L9 25.6 Q4.6 22 4 15 Z" style={S('metal')} />
        <path d="M4 15 Q3 -0.6 15 -0.6 Q27.6 0 27.6 12 L28.6 17.8 Q27 23 21.6 25.6 L9 25.6 Q4.6 22 4 15 Z" fill="url(#fd-metal)" />
        <path d="M18.4 10.6 L28 10.2 L28 12.6 L18.6 12.8 Z" fill="#06070a" />
        <path d="M21 16 L27.4 15.8 M21 18.4 L27 18.2" stroke="#06070a" strokeWidth=".9" />
        <path d="M4.6 14 Q14 7.8 27.8 10" stroke="var(--trim)" strokeWidth="1.2" fill="none" />
        <path d="M16.4 25.6 L16.4 -0.4" stroke="var(--trim)" strokeWidth="1" opacity=".7" />
      </>}
    </svg>
  )
}
// a plume rides on top of heavy helmets, flowing back
function Plume() {
  return (
    <svg className="fp plume" style={{ left: -16, top: -40 }} width="26" height="20" viewBox="0 0 26 20">
      <path d="M17 12 Q12 0 2 4 Q8 6 6 10 Q11 8 10 14 Q14 11 17 13 Z" style={S('armorL')} />
      <path d="M17 12 Q12 0 2 4 Q8 6 6 10" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth=".8" />
    </svg>
  )
}
function UpperArm({ tier }) {
  return (
    <svg className="fp" style={{ left: -8, top: -7 }} width="17" height="32" viewBox="0 0 17 32">
      <path d="M3 5 Q8.5 1 14 5 L12.5 28 Q8.5 31 4.5 28 Z" style={S(tier >= 1 ? 'legs' : 'skin')} />
      <path d="M3 5 Q8.5 1 14 5 L12.5 28 Q8.5 31 4.5 28 Z" fill="url(#fd-cyl)" />
      {/* pauldron */}
      <path d="M0.6 9 Q0 0.6 8.5 0.4 Q16.6 0.6 16.4 9 Q12 7 8.5 7.6 Q4.6 7 0.6 9 Z" style={S(tier >= 2 ? 'armor' : 'leather')} />
      <path d="M0.6 9 Q0 0.6 8.5 0.4 Q16.6 0.6 16.4 9 Q12 7 8.5 7.6 Q4.6 7 0.6 9 Z" fill="url(#fd-metal)" opacity={tier >= 2 ? 1 : 0.4} />
      {tier >= 3 && <path d="M0.8 8.6 Q4.6 6.6 8.5 7.2 Q12 6.6 16.2 8.6" stroke="var(--trim)" strokeWidth="1" fill="none" />}
    </svg>
  )
}
function Forearm({ tier }) {
  return (
    <svg className="fp" style={{ left: -7, top: -3 }} width="15" height="28" viewBox="0 0 15 28">
      <path d="M2.5 1 L12.5 1 L11 21 L4 21 Z" style={S('skin')} />
      <path d="M2.5 1 L12.5 1 L11 21 L4 21 Z" fill="url(#fd-cyl)" />
      <path d="M2 6 L13 6 L11.8 21 L3.2 21 Z" style={S(tier >= 2 ? 'metal' : 'leather')} />
      <path d="M2 6 L13 6 L11.8 21 L3.2 21 Z" fill={tier >= 2 ? 'url(#fd-metal)' : 'url(#fd-cyl)'} />
      <path d="M2.4 7.4 L12.6 7.4" stroke="var(--trim)" strokeWidth="1" opacity=".8" />
    </svg>
  )
}
function Fist() {
  return (
    <svg className="fp" style={{ left: -5.5, top: -5 }} width="11" height="11" viewBox="0 0 11 11">
      <path d="M1.4 2.6 Q5.5 -0.4 9.6 2.6 L9.8 7.6 Q5.5 10.6 1.2 7.6 Z" style={S('glove')} />
      <path d="M1.4 2.6 Q5.5 -0.4 9.6 2.6 L9.8 7.6 Q5.5 10.6 1.2 7.6 Z" fill="url(#fd-cyl)" />
      <path d="M2.6 4.2 L8.6 4.2 M2.6 6.2 L8.6 6.2" stroke="#0005" strokeWidth=".6" />
    </svg>
  )
}

// Weapons are drawn with the grip at (G, 20) and the business end along +x.
const G = 18
function Weapon({ kind }) {
  const box = { sword: [70, 40], axe: [62, 40], spear: [96, 40], hammer: [62, 40], staff: [80, 40], flame: [80, 40], scythe: [84, 50], banner: [84, 56], daggers: [42, 40] }[kind] || [70, 40]
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
      <path d="M74 20 Q70 27 72 32" stroke="var(--armorL)" strokeWidth="1.6" fill="none" />
    </>; break
    case 'hammer': body = <>
      <rect x="4" y="18.4" width="44" height="3.6" rx="1.4" fill="url(#fd-wood)" />
      <rect x="42" y="6" width="16" height="28" rx="2" style={S('metal')} stroke="#3e4652" strokeWidth=".8" />
      <rect x="42" y="6" width="16" height="28" rx="2" fill="url(#fd-metal)" />
      <rect x="42" y="18" width="16" height="4" fill="var(--trim)" />
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
      <path d="M76 29 L76 54 L64 50 L52 54 L52 29 Z" style={S('armorL')} stroke="#0006" strokeWidth=".7" />
      <path d="M76 29 L76 54 L64 50 L52 54 L52 29 Z" fill="url(#fd-cyl)" />
      <circle cx="64" cy="39" r="4" fill="var(--trim)" />
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
  return (
    <svg className={`fp weapon wpn-${kind}`} style={{ left: -G, top: -20 }} width={box[0]} height={box[1]} viewBox={`0 0 ${box[0]} ${box[1]}`}>
      {body}
    </svg>
  )
}
// the shield is held edge-on in front of the chest; the card art is its face
function Shield({ art, tier }) {
  return (
    <div className="f-shield" aria-hidden="true">
      <svg className="fp" style={{ left: -9, top: -21 }} width="18" height="42" viewBox="0 0 18 42">
        <path d="M2 3 Q9 -0.6 16 3 L16 26 Q16 36 9 41 Q2 36 2 26 Z" style={S(tier >= 2 ? 'metal' : 'leather')} stroke="#0008" strokeWidth=".8" />
        <path d="M2 3 Q9 -0.6 16 3 L16 26 Q16 36 9 41 Q2 36 2 26 Z" fill="url(#fd-metal)" />
        <path d="M3.6 4.6 Q9 2 14.4 4.6 L14.4 25.6 Q14.4 34 9 38.4 Q3.6 34 3.6 25.6 Z" style={S('armor')} />
        <path d="M3.6 4.6 Q9 2 14.4 4.6 L14.4 25.6 Q14.4 34 9 38.4 Q3.6 34 3.6 25.6 Z" fill="url(#fd-cyl)" />
        <path d="M2 3 Q9 -0.6 16 3 L16 26 Q16 36 9 41 Q2 36 2 26 Z" fill="none" stroke="var(--trim)" strokeWidth="1.2" />
      </svg>
      {art && <div className="f-emb" style={{ backgroundImage: `url("${art}")` }} />}
    </div>
  )
}

function Fighter({ unit, art, rarity, side, pose = 'idle', wpn }) {
  const weapon = wpn || weaponFor(unit)
  const style = STYLE[weapon] || 'slash'
  const tier = rarity?.tier ?? 0
  const p = PALETTE[unit.element] || PALETTE.ember
  const h = hash(unit.ref ? `${unit.ref.kind}:${unit.ref.id}` : unit.id)
  const [skin, skinD] = SKIN[h % SKIN.length]
  const hair = HAIR[(h >> 4) % HAIR.length]
  const hairStyle = (h >> 8) % 3
  const shield = shieldFor(unit, weapon)
  const vars = {
    '--armor': p.armor, '--armorL': p.armorL, '--cloth': p.cloth, '--glow': p.glow,
    '--skin': skin, '--skinD': skinD, '--hair': hair,
    '--metal': tier >= 4 ? '#c9b37a' : '#a9b3c1',
    '--trim': tier >= 3 ? '#f4c950' : tier >= 2 ? '#d7dde6' : '#9a7a52',
    '--leather': '#6a4527', '--legs': tier >= 2 ? '#3a3f4a' : '#4b3a2c', '--boot': '#3b2616', '--glove': tier >= 2 ? '#5d6675' : '#5a3a22',
  }
  return (
    <div className={`ftr ftr-${side} ftier-${tier} wpn-${weapon} sty-${style} pose-${pose}`} style={vars} aria-hidden="true">
      {tier >= 4 && <div className="f-aura" />}
      <div className="f-shadow" />
      <div className="rig">
        <div className="j j-root">
          <div className="j j-legF far"><Thigh tier={tier} /><div className="j j-shinF"><Shin tier={tier} /></div></div>
          <div className="j j-legN"><Thigh tier={tier} /><div className="j j-shinN"><Shin tier={tier} /></div></div>
          <div className="j j-torso">
            <div className="j j-cape">
              <svg className="fp" style={{ left: -6, top: 0 }} width="18" height="50" viewBox="0 0 18 50">
                <path d="M10 0 Q16 2 14 12 Q12 30 16 48 L2 46 Q-1 28 4 10 Q6 2 10 0 Z" style={S('cloth')} />
                <path d="M10 0 Q16 2 14 12 Q12 30 16 48 L2 46 Q-1 28 4 10 Q6 2 10 0 Z" fill="url(#fd-cyl)" />
              </svg>
            </div>
            <div className="j j-armF far">
              <UpperArm tier={tier} />
              <div className="j j-foreF"><Forearm tier={tier} />
                <div className="j j-handF">{shield ? <Shield art={art} tier={tier} /> : weapon === 'daggers' ? <Weapon kind="daggers" /> : null}<Fist /></div>
              </div>
            </div>
            <div className="j j-body"><Torso tier={tier} art={!shield && art} />{!shield && art && <div className="f-chest" style={{ backgroundImage: `url("${art}")` }} />}</div>
            <div className="j j-head"><Head tier={tier} hairStyle={hairStyle} h={h} />{tier >= 4 && <Plume />}</div>
            <div className="j j-armN">
              <UpperArm tier={tier} />
              <div className="j j-foreN"><Forearm tier={tier} />
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
