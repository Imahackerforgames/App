import { memo } from 'react'
import { SPRITES } from '../lib/sprites.js'

// A card on the battlefield becomes a fighter: one of the twelve characters
// from the creator's character sheets. Which one comes from the card itself,
// so a card is always the same fighter.
//
// The sprites are single pictures, so the motion comes from moving the whole
// figure the way a fighting-game sprite moves: it breathes while it waits,
// leans into a run, winds up and lunges through a strike, snaps back when hit
// and topples when knocked out. Every sprite is turned to face its enemy.

// Each picture is cut into three parts at runtime (upper body, back leg,
// front leg) along the waist and the gap between the legs, so the legs can
// step on their own while the upper body twists into blows.
//   hip: waist line, as a fraction of the picture's height
//   split: the gap between the legs, as a fraction of its width
//   weight: how the fighter moves (light / mid / heavy / mech)
//   moves: the combo it throws when it attacks
export const CREW = [
  { id: 'shade', name: 'Shade', role: 'Assassin', weapon: 'kunai', size: 1, hip: 0.6, split: 0.5, weight: 'light', moves: ['jab', 'cross', 'kick'] },
  { id: 'gearbeard', name: 'Gearbeard', role: 'Mechanic', weapon: 'wrench', size: 1.08, left: true, hip: 0.64, split: 0.55, weight: 'heavy', moves: ['windup', 'smash'] },
  { id: 'mantis', name: 'Mantis', role: 'Lancer', weapon: 'lance', size: 1.08, left: true, hip: 0.6, split: 0.42, weight: 'light', moves: ['stab', 'stab', 'lunge'] },
  { id: 'chef', name: 'Big Chef', role: 'Bruiser', weapon: 'cleaver', size: 1.08, left: true, hip: 0.76, split: 0.55, weight: 'heavy', moves: ['slash', 'overhead'] },
  { id: 'nomad', name: 'Nomad', role: 'Duelist', weapon: 'scimitar', size: 1, left: true, hip: 0.62, split: 0.55, weight: 'mid', moves: ['slash', 'reverse', 'overhead'] },
  { id: 'boltbot', name: 'Bolt-Bot', role: 'Brawler', weapon: 'fists', size: 1.02, hip: 0.64, split: 0.5, weight: 'mech', moves: ['jab', 'cross', 'uppercut'] },
  { id: 'sporesage', name: 'Spore Sage', role: 'Mystic', weapon: 'staff', size: 0.9, hip: 0.86, split: 0.42, weight: 'mid', moves: ['cast'] },
  { id: 'scarecrow', name: 'Scarecrow', role: 'Reaper', weapon: 'scythe', size: 1.04, hip: 0.62, split: 0.4, weight: 'mid', moves: ['slash', 'reverse', 'spin'] },
  { id: 'diver', name: 'Deep Diver', role: 'Harpooner', weapon: 'harpoon', size: 1.04, hip: 0.72, split: 0.42, weight: 'heavy', moves: ['stab', 'lunge'] },
  { id: 'punk', name: 'Riot', role: 'Wrecker', weapon: 'flail', size: 0.98, left: true, hip: 0.6, split: 0.56, weight: 'light', moves: ['slash', 'reverse', 'overhead'] },
  { id: 'golem', name: 'Stone King', role: 'Colossus', weapon: 'mace', size: 1.18, hip: 0.64, split: 0.44, weight: 'heavy', moves: ['smash'] },
  { id: 'voidarcher', name: 'Void Archer', role: 'Sniper', weapon: 'bow', size: 1.02, hip: 0.62, split: 0.4, weight: 'light', moves: ['cast'] },
]

// How each body type moves. speed is screen px per second; step is the time
// for one footfall; stride animation and travel speed are tied together so
// feet don't slide. tempo stretches every attack (heavy fighters wind up
// longer and follow through harder).
export const PROFILES = {
  light: { speed: 300, step: 0.16, run: true, swing: 28, lift: 9, bob: 5, lean: 9, tempo: 0.85, dodges: true },
  mid: { speed: 210, step: 0.22, run: false, swing: 20, lift: 6, bob: 3, lean: 4, tempo: 1, dodges: false },
  heavy: { speed: 140, step: 0.32, run: false, swing: 14, lift: 4, bob: 5, lean: 3, tempo: 1.3, dodges: false },
  mech: { speed: 180, step: 0.25, run: false, swing: 16, lift: 6, bob: 2, lean: 2, tempo: 1, dodges: false, mech: true },
}

// Every attack: how long it takes (ms, before tempo), when the blow lands
// (fraction of that time) and how hard it knocks the target back.
export const MOVES = {
  jab: { dur: 280, hit: 0.45, power: 0.8 },
  cross: { dur: 340, hit: 0.5, power: 1.1 },
  uppercut: { dur: 420, hit: 0.55, power: 1.5 },
  kick: { dur: 440, hit: 0.52, power: 1.5 },
  slash: { dur: 360, hit: 0.5, power: 1 },
  reverse: { dur: 360, hit: 0.5, power: 1.1 },
  overhead: { dur: 480, hit: 0.56, power: 1.6 },
  spin: { dur: 520, hit: 0.6, power: 1.5 },
  stab: { dur: 300, hit: 0.48, power: 0.9 },
  lunge: { dur: 460, hit: 0.55, power: 1.6 },
  windup: { dur: 520, hit: 0.7, power: 1.2 },
  smash: { dur: 760, hit: 0.6, power: 2.4 },
  cast: { dur: 560, hit: 0.45, power: 1.2 },
}

export const OUTFIT_NAMES = Object.fromEntries(CREW.map((c) => [c.id, `${c.name} · ${c.role}`]))
export const WEAPON_NAMES = { kunai: 'Kunai', wrench: 'Giant wrench', lance: 'Lance', cleaver: 'Cleaver', scimitar: 'Scimitar', fists: 'Power fists', staff: 'Spore staff', scythe: 'Scythe', harpoon: 'Harpoon', flail: 'Flail', mace: 'Spiked mace', bow: 'Void bow' }
// how each weapon fights: run in and slash, thrust or smash, or stay back
// and shoot (bow) or cast (staff)
export const STYLE = { kunai: 'slash', wrench: 'smash', lance: 'thrust', cleaver: 'slash', scimitar: 'slash', fists: 'smash', staff: 'cast', scythe: 'slash', harpoon: 'thrust', flail: 'smash', mace: 'smash', bow: 'cast' }
const GLOW = { ember: '#ff8a4a', gale: '#b6ff6a', tide: '#6fd6ff' }

function hash(t) { let h = 2166136261; for (const c of String(t)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const keyOf = (u) => (u.ref ? `${u.ref.kind}:${u.ref.id}` : String(u.id))

export function loadoutOf(u, _tier = 0, force = null) {
  const crew = CREW.find((c) => c.id === force?.crew) || CREW[hash(keyOf(u) + ':crew') % CREW.length]
  return { ...crew, crew: crew.id, outfit: crew.id, profile: PROFILES[crew.weight], tempo: 2.2 + (hash(keyOf(u) + ':tempo') % 9) / 10 }
}
export function weaponFor(u) { return loadoutOf(u).weapon }

// Shared shading used by the drawn scenery props.
export function FighterDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <linearGradient id="fd-cyl" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".55" /><stop offset=".3" stopColor="#fff" stopOpacity=".2" /><stop offset=".5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".6" />
        </linearGradient>
        <linearGradient id="fd-vert" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".25" /><stop offset=".45" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id="fd-gloss" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".3" stopColor="#fff" stopOpacity=".7" /><stop offset=".42" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="fd-glass" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".55" /><stop offset=".4" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="fd-spec" cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="fd-wood" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#c09060" /><stop offset="1" stopColor="#5a3a1e" /></linearGradient>
      </defs>
    </svg>
  )
}

// pose: idle | walk | run | walkback | mv (an attack, named by move) | hurt |
//       block | dodge | die | victory | defeat | still
// The part layers all show the same picture, each clipped to its piece.
function Fighter({ unit, rarity, side, pose = 'idle', look = null, move = null, dur = 0, power = 1 }) {
  const tier = rarity?.tier ?? 0
  const L = loadoutOf(unit, tier, look)
  const P = L.profile
  const sp = SPRITES[L.crew]
  const style = STYLE[L.weapon] || 'slash'
  const h = Math.round(92 * (L.size || 1))
  const w = sp ? Math.round((sp.w / sp.h) * h) : h
  // A picture drawn facing left is mirrored inside each part (not the parts
  // themselves), so every joint moves in screen direction: forward is always
  // toward the enemy and the right-hand leg is always the front leg.
  const hip = L.hip * 100, sx = (L.left ? 1 - L.split : L.split) * 100
  const legClip = (right) => right ? `polygon(${sx}% ${hip - 1}%, 100% ${hip - 1}%, 100% 100%, ${sx}% 100%)` : `polygon(0 ${hip - 1}%, ${sx}% ${hip - 1}%, ${sx}% 100%, 0 100%)`
  const legOrigin = (right) => `${right ? Math.min(95, sx + 12) : Math.max(5, sx - 12)}% ${hip}%`
  const layer = (cls, clip, origin) => (
    <div className={`fp-part ${cls}`} style={{ clipPath: clip, WebkitClipPath: clip, transformOrigin: origin }}>
      <img src={sp.src} alt="" draggable="false" style={L.left ? { transform: 'scaleX(-1)' } : undefined} />
    </div>
  )
  const vars = {
    '--glow': GLOW[unit.element] || '#ffd166', '--tempo': `${L.tempo}s`,
    '--step': `${P.step}s`, '--swing': `${P.swing}deg`, '--lift': `${P.lift}px`, '--bob': `${P.bob}px`, '--lean': `${P.lean}deg`,
    '--mvd': `${dur}ms`, '--kb': `${Math.round(10 + power * 9)}px`, '--kr': `${Math.round(6 + power * 7)}deg`,
  }
  return (
    <div className={`ftr sprite jointed ftr-${side} ftier-${tier} out-${L.crew} wt-${L.weight} wpn-${L.weapon} sty-${style} pose-${pose} ${move ? 'mv-' + move : ''}`} style={vars} aria-hidden="true">
      {tier >= 4 && <div className="f-aura" />}
      <div className="f-shadow" />
      {pose === 'run' && sp && [1, 2].map((k) => <div key={k} className={`fgh g${k}`} style={{ width: w, height: h, marginLeft: -w / 2 }}><img src={sp.src} alt="" draggable="false" style={{ transform: L.left ? 'scaleX(-1)' : undefined }} /></div>)}
      <div className="fb" style={{ width: w, height: h, marginLeft: -w / 2 }}>
        {sp && (
          <div className="fflip">
            {layer('leg back', legClip(false), legOrigin(false))}
            {layer('leg front', legClip(true), legOrigin(true))}
            {layer('upper', `polygon(0 0, 100% 0, 100% ${hip + 6}%, 0 ${hip + 6}%)`, `${sx}% ${hip}%`)}
          </div>
        )}
      </div>
    </div>
  )
}
export default memo(Fighter)
