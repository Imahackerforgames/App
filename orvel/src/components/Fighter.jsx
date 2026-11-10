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

export const CREW = [
  { id: 'shade', name: 'Shade', role: 'Assassin', weapon: 'kunai', size: 1 },
  { id: 'gearbeard', name: 'Gearbeard', role: 'Mechanic', weapon: 'wrench', size: 1.08, left: true },
  { id: 'mantis', name: 'Mantis', role: 'Lancer', weapon: 'lance', size: 1.08, left: true },
  { id: 'chef', name: 'Big Chef', role: 'Bruiser', weapon: 'cleaver', size: 1.08, left: true },
  { id: 'nomad', name: 'Nomad', role: 'Duelist', weapon: 'scimitar', size: 1, left: true },
  { id: 'boltbot', name: 'Bolt-Bot', role: 'Brawler', weapon: 'fists', size: 1.02 },
  { id: 'sporesage', name: 'Spore Sage', role: 'Mystic', weapon: 'staff', size: 0.9 },
  { id: 'scarecrow', name: 'Scarecrow', role: 'Reaper', weapon: 'scythe', size: 1.04 },
  { id: 'diver', name: 'Deep Diver', role: 'Harpooner', weapon: 'harpoon', size: 1.04 },
  { id: 'punk', name: 'Riot', role: 'Wrecker', weapon: 'flail', size: 0.98, left: true },
  { id: 'golem', name: 'Stone King', role: 'Colossus', weapon: 'mace', size: 1.18 },
  { id: 'voidarcher', name: 'Void Archer', role: 'Sniper', weapon: 'bow', size: 1.02 },
]
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
  return { ...crew, crew: crew.id, outfit: crew.id, tempo: 2.2 + (hash(keyOf(u) + ':tempo') % 9) / 10 }
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

function Fighter({ unit, rarity, side, pose = 'idle', look = null }) {
  const tier = rarity?.tier ?? 0
  const L = loadoutOf(unit, tier, look)
  const sp = SPRITES[L.crew]
  const style = STYLE[L.weapon] || 'slash'
  const h = Math.round(128 * (L.size || 1))
  return (
    <div className={`ftr sprite ftr-${side} ftier-${tier} out-${L.crew} wpn-${L.weapon} sty-${style} pose-${pose}`}
      style={{ '--glow': GLOW[unit.element] || '#ffd166', '--tempo': `${L.tempo}s` }} aria-hidden="true">
      {tier >= 4 && <div className="f-aura" />}
      <div className="f-shadow" />
      <div className="spr">
        {sp && <img src={sp.src} alt="" draggable="false" style={{ height: h, transform: L.left ? 'scaleX(-1)' : undefined }} />}
      </div>
    </div>
  )
}
export default memo(Fighter)
