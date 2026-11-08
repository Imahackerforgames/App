import { DEFAULT_RARITIES } from '../server/defaults.js'
import { valueInRange, seededUnit } from '../server/game.js'

// Generated placeholder artwork so a fresh install is playable before any real
// art is uploaded. Vector, so it is sharp at every zoom level. Every card made
// from this is flagged `sample` and can be removed in one click from Admin.

function prng(seed) {
  let h = 2166136261
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const W = 1000, H = 1250
const PALETTES = {
  nocturne: ['#050b26', '#14215c', '#3d4fa8', '#9bb6ff', '#f2f6ff'],
  ember: ['#2a0610', '#7a1731', '#e0503a', '#ffae5c', '#fff1c9'],
  signal: ['#03140f', '#0b3b33', '#1fa38a', '#7bffd9', '#e9fff8'],
  void: ['#07010f', '#2b0a4f', '#7b2ff7', '#ff5cf0', '#ffe9ff'],
  dawn: ['#120a2a', '#4a2b7a', '#d06aa8', '#ffc4a3', '#fff8ee'],
}

function ridge(r, y, amp, n) {
  let d = `M0 ${H} L0 ${y}`
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * W
    d += ` L${x.toFixed(0)} ${(y - r() * amp).toFixed(0)}`
  }
  return d + ` L${W} ${H} Z`
}
function wave(r, y, amp, phase) {
  let d = `M0 ${H} L0 ${y}`
  for (let x = 0; x <= W; x += 20) d += ` L${x} ${(y + Math.sin(x / 90 + phase) * amp + Math.sin(x / 31 + phase * 2) * amp * 0.3).toFixed(1)}`
  return d + ` L${W} ${H} Z`
}

export function makeArt(seed, theme, kind) {
  const r = prng(seed)
  const p = PALETTES[theme] || PALETTES.nocturne
  const parts = []
  const id = seed.replace(/\W/g, '')
  parts.push(`<defs>
    <linearGradient id="sky${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p[0]}"/><stop offset="0.6" stop-color="${p[1]}"/><stop offset="1" stop-color="${p[2]}"/></linearGradient>
    <radialGradient id="orb${id}"><stop offset="0" stop-color="${p[4]}"/><stop offset="0.5" stop-color="${p[3]}"/><stop offset="1" stop-color="${p[3]}" stop-opacity="0"/></radialGradient>
    <radialGradient id="neb${id}"><stop offset="0" stop-color="${p[3]}" stop-opacity="0.7"/><stop offset="1" stop-color="${p[2]}" stop-opacity="0"/></radialGradient>
  </defs>`)
  parts.push(`<rect width="${W}" height="${H}" fill="url(#sky${id})"/>`)
  // stars
  const stars = 60 + Math.floor(r() * 120)
  for (let i = 0; i < stars; i++) parts.push(`<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H * 0.65).toFixed(0)}" r="${(r() * 2.2 + 0.3).toFixed(1)}" fill="${p[4]}" opacity="${(0.3 + r() * 0.7).toFixed(2)}"/>`)

  const ox = 200 + r() * 600, oy = 220 + r() * 300, or = 90 + r() * 160
  if (kind === 'nebula') {
    for (let i = 0; i < 6; i++) parts.push(`<ellipse cx="${(r() * W).toFixed(0)}" cy="${(r() * H * 0.8).toFixed(0)}" rx="${200 + r() * 300}" ry="${100 + r() * 200}" fill="url(#neb${id})" transform="rotate(${(r() * 180).toFixed(0)} ${W / 2} ${H / 2})"/>`)
    parts.push(`<circle cx="${ox}" cy="${oy}" r="${or * 1.8}" fill="url(#orb${id})" opacity="0.8"/>`)
    for (let i = 0; i < 3; i++) parts.push(`<ellipse cx="${ox}" cy="${oy}" rx="${or * (1.3 + i * 0.4)}" ry="${or * (0.25 + i * 0.08)}" fill="none" stroke="${p[4]}" stroke-opacity="${0.5 - i * 0.12}" stroke-width="${3 - i}" transform="rotate(-18 ${ox} ${oy})"/>`)
    parts.push(`<circle cx="${ox}" cy="${oy}" r="${or * 0.55}" fill="${p[0]}"/><circle cx="${ox}" cy="${oy}" r="${or * 0.55}" fill="none" stroke="${p[4]}" stroke-width="4"/>`)
  } else {
    parts.push(`<circle cx="${ox}" cy="${oy}" r="${or * 2.2}" fill="url(#orb${id})" opacity="0.55"/>`)
    parts.push(`<circle cx="${ox}" cy="${oy}" r="${or * 0.6}" fill="${p[4]}"/>`)
  }

  if (kind === 'sea' || kind === 'nebula') {
    for (let i = 0; i < 5; i++) parts.push(`<path d="${wave(r, H * (0.62 + i * 0.08), 12 + i * 6, r() * 6)}" fill="${p[Math.max(0, 2 - Math.floor(i / 2))]}" opacity="${0.45 + i * 0.12}"/>`)
    parts.push(`<rect x="${ox - or * 0.5}" y="${H * 0.62}" width="${or}" height="${H * 0.38}" fill="${p[4]}" opacity="0.12"/>`)
  } else if (kind === 'city') {
    parts.push(`<path d="${ridge(r, H * 0.62, 120, 7)}" fill="${p[1]}" opacity="0.8"/>`)
    let x = 0
    while (x < W) {
      const w = 40 + r() * 90, h = 120 + r() * 420
      parts.push(`<rect x="${x.toFixed(0)}" y="${(H - h).toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="${p[0]}"/>`)
      for (let wy = H - h + 20; wy < H - 20; wy += 28) for (let wx = x + 10; wx < x + w - 12; wx += 18) if (r() > 0.62) parts.push(`<rect x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" width="8" height="12" fill="${p[3]}" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`)
      if (r() > 0.7) parts.push(`<line x1="${(x + w / 2).toFixed(0)}" y1="${(H - h).toFixed(0)}" x2="${(x + w / 2).toFixed(0)}" y2="${(H - h - 80).toFixed(0)}" stroke="${p[3]}" stroke-width="3"/><circle cx="${(x + w / 2).toFixed(0)}" cy="${(H - h - 80).toFixed(0)}" r="6" fill="${p[4]}"/>`)
      x += w + 4
    }
  } else if (kind === 'crystal') {
    parts.push(`<path d="${ridge(r, H * 0.75, 90, 10)}" fill="${p[0]}"/>`)
    for (let i = 0; i < 9; i++) {
      const cx = 80 + r() * (W - 160), base = H * (0.75 + r() * 0.2), h = 150 + r() * 380, w = 40 + r() * 70
      parts.push(`<polygon points="${cx - w},${base} ${cx},${base - h} ${cx + w},${base}" fill="${p[2 + (i % 2)]}" opacity="0.85"/><polygon points="${cx},${base - h} ${cx + w},${base} ${cx + w * 0.2},${base}" fill="${p[4]}" opacity="0.35"/>`)
    }
  } else {
    for (let i = 0; i < 4; i++) parts.push(`<path d="${ridge(r, H * (0.52 + i * 0.12), 160 - i * 25, 6 + i * 3)}" fill="${p[Math.max(0, 3 - i)]}" opacity="${0.55 + i * 0.15}"/>`)
    parts.push(`<path d="${ridge(r, H * 0.95, 60, 14)}" fill="${p[0]}"/>`)
  }
  // a lone figure on some pieces, for scale and story
  if (r() > 0.55) {
    const fx = 150 + r() * 700, fy = H * 0.86
    parts.push(`<g fill="${p[0]}"><circle cx="${fx}" cy="${fy - 62}" r="11"/><path d="M${fx - 14} ${fy - 50} L${fx + 14} ${fy - 50} L${fx + 10} ${fy} L${fx - 10} ${fy} Z"/></g>`)
    if (kind !== 'city') parts.push(`<circle cx="${fx + 22}" cy="${fy - 40}" r="7" fill="${p[4]}"/><circle cx="${fx + 22}" cy="${fy - 40}" r="20" fill="${p[3]}" opacity="0.3"/>`)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${parts.join('')}</svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

// [name, rarity, theme, kind, collection, description]
const SEED = [
  ['Midnight Lantern', 'r3', 'nocturne', 'sea', 'col-nocturne', 'A single light carried along the shoreline long after the town fell asleep.'],
  ['Midnight Tide', 'r1', 'nocturne', 'sea', 'col-nocturne', 'The water goes silver for an hour each night, and nobody can say why.'],
  ['Midnight Static', 'r2', 'signal', 'city', 'col-signal', 'Every radio in the city tuned itself to the same empty frequency.'],
  ['Hushed Orbit', 'r2', 'void', 'nebula', 'col-nocturne', 'A moon that circles nothing at all.'],
  ['Lantern Bay', 'r1', 'nocturne', 'sea', 'col-nocturne', 'Fishing boats wait out the dark with their lamps turned low.'],
  ['Cinder Ridge', 'r1', 'ember', 'hills', 'col-ember', 'Late-summer hills, still warm from the day.'],
  ['Ashfall Valley', 'r2', 'ember', 'hills', 'col-ember', 'Grey snow that never melts, under a red sun.'],
  ['The Last Ember', 'r4', 'ember', 'crystal', 'col-ember', 'Kept burning for a hundred years by people who never met.'],
  ['Copper Dusk', 'r1', 'ember', 'hills', 'col-ember', 'The whole sky the colour of an old coin.'],
  ['Kiln Moon', 'r3', 'ember', 'nebula', 'col-ember', 'It rises orange and sets white.'],
  ['Relay Tower 9', 'r1', 'signal', 'city', 'col-signal', 'Still transmitting. Still nobody listening.'],
  ['Phosphor Avenue', 'r2', 'signal', 'city', 'col-signal', 'Streetlights that glow green after the power goes out.'],
  ['Dead Channel', 'r1', 'signal', 'city', 'col-signal', 'Snow on every screen, and in it, a shape.'],
  ['Carrier Wave', 'r3', 'signal', 'sea', 'col-signal', 'A tide that rises on schedule, every 47 minutes.'],
  ['Ghost Frequency', 'r4', 'signal', 'nebula', 'col-signal', 'Heard only by those who stop looking for it.'],
  ['Glass Garden', 'r2', 'dawn', 'crystal', null, 'Flowers that ring like bells when the wind turns.'],
  ['Prism Hollow', 'r3', 'dawn', 'crystal', null, 'Light goes in. Something else comes out.'],
  ['Dawnbreaker', 'r4', 'dawn', 'hills', null, 'The first morning after the long night.'],
  ['Pale Meridian', 'r1', 'dawn', 'hills', null, 'The line where the map simply stops.'],
  ['Quiet Comet', 'r2', 'nocturne', 'nebula', 'col-nocturne', 'It passed so slowly that whole lives were spent watching it.'],
  ['Hollow Crown', 'r5', 'void', 'crystal', null, 'Worn by no one. Waiting.'],
  ['Throne of Static', 'r5', 'void', 'city', 'col-signal', 'The city chose its own ruler.'],
  ['Eclipse Choir', 'r5', 'void', 'nebula', 'col-nocturne', 'For three minutes, the stars sang.'],
  ['Origin', 'r6', 'void', 'nebula', null, 'Card zero. Before every other card, there was this.'],
  ['Small Hours', 'r1', 'nocturne', 'hills', 'col-nocturne', 'The part of the night that belongs to no day.'],
  ['Tidewatcher', 'r2', 'nocturne', 'sea', 'col-nocturne', 'Someone has to keep count of the waves.'],
  ['Moth Signal', 'r1', 'dawn', 'city', 'col-signal', 'They gather wherever the old lamps still flicker.'],
  ['Saltglass Shore', 'r3', 'dawn', 'sea', null, 'Sand turned to glass by a falling star.'],
  ['Emberwake', 'r2', 'ember', 'sea', 'col-ember', 'A ship that leaves a trail of sparks behind it.'],
  ['Starwell', 'r4', 'nocturne', 'crystal', 'col-nocturne', 'Drop a wish in. Something drops one back.'],
]

export function seedCards() {
  return SEED.map(([name, rarityId, theme, kind, col, description], i) => ({
    name, rarityId, description,
    collectionNumber: i + 1,
    sellValue: (({ minValue, maxValue }) => valueInRange(minValue, maxValue, seededUnit(name)))(DEFAULT_RARITIES.find((r) => r.id === rarityId)),
    imageUrl: `gen:${theme}|${kind}|${name}`, // drawn on the device by artFromRef()
    imageW: W, imageH: H,
    collectionIds: col ? [col] : [],
    packIds: col === 'col-nocturne' ? ['pk-firstlight'] : [],
  }))
}

// Sample art is stored as a short recipe ("gen:theme|kind|seed") and drawn on
// the device, so the shared catalog stays small.
const genCache = new Map()
export function artFromRef(url) {
  if (!url || !url.startsWith('gen:')) return url
  if (!genCache.has(url)) { const [theme, kind, ...seed] = url.slice(4).split('|'); genCache.set(url, makeArt(seed.join('|'), theme, kind)) }
  return genCache.get(url)
}
