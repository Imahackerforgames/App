// ORVEL Arena: card duels against rivals, plus the Forge's custom-card rules.
// Pure functions only. The game server (game.js) owns state, wagers and
// payouts; this file decides what cards can do and how a round resolves.

import { randomInt } from './rng.js'

// ───────────────────────── elements & abilities ─────────────────────────

// Ember beats Gale, Gale beats Tide, Tide beats Ember.
export const ELEMENTS = [
  { id: 'ember', name: 'Ember', glyph: '▲', color: '#ff7a45', beats: 'gale' },
  { id: 'gale', name: 'Gale', glyph: '❖', color: '#b6ff6a', beats: 'tide' },
  { id: 'tide', name: 'Tide', glyph: '≈', color: '#4fc3ff', beats: 'ember' },
]
export const ELEMENT_BONUS = 3

export const ABILITIES = [
  { id: 'pierce', name: 'Pierce', text: 'Damage beyond what kills the enemy unit carries through to their leader.' },
  { id: 'shield', name: 'Shield', text: 'Takes 2 less damage from every hit.' },
  { id: 'drain', name: 'Drain', text: 'Heals your leader for half the damage it deals.' },
  { id: 'rally', name: 'Rally', text: 'When played, your other units get +2 ATK this turn.' },
  { id: 'burn', name: 'Burn', text: 'Units it hits burn for 2 at the start of their next turn.' },
  { id: 'surge', name: 'Surge', text: '+3 ATK while your leader has less HP than theirs.' },
  { id: 'counter', name: 'Counter', text: 'When hit and still standing, strikes back for half its ATK.' },
  { id: 'hex', name: 'Hex', text: 'When played, the enemy unit in its lane loses 3 ATK for good.' },
]

export const MAX_HP = 25 // kept for older imports; leaders use LEADER_HP

function hash(text) {
  let h = 2166136261
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}
const unit = (text) => (hash(text) % 10007) / 10006

// Battle stats for a catalog card: rarer and more valuable means stronger.
// Card levels. Every copy pulled from a pack rolls a level inside its
// rarity's band, weighted toward the bottom so a top roll is rare; LV 77 only
// exists at the very top of the rarest band. A copy's place in its band adds
// up to +3 stats, so levels matter without letting a common outfight a legend.
export const MAX_LEVEL = 77
export const LEVEL_BANDS = [[1, 12], [10, 24], [20, 36], [32, 50], [46, 64], [60, 77]]
export const levelBand = (tier) => LEVEL_BANDS[Math.max(0, Math.min(LEVEL_BANDS.length - 1, tier | 0))]
export function rollLevel(tier, u) {
  const [a, b] = levelBand(tier)
  return Math.min(b, a + Math.floor((b - a + 1) * u * u))
}
export function levelBonus(tier, level) {
  if (level == null) return 0
  const [a, b] = levelBand(tier)
  return Math.round(3 * Math.max(0, Math.min(1, (level - a) / (b - a))))
}

export function cardStats(card, tier, valueInRangeUnit = 0.5, level = null) {
  const total = 6 + tier * 3 + Math.round(2 * valueInRangeUnit) + levelBonus(tier, level)
  const r = 0.35 + 0.3 * unit(card.id + ':split')
  const atk = Math.max(1, Math.round(total * r))
  const def = Math.max(1, total - atk)
  const element = ELEMENTS[hash(card.id + ':el') % 3].id
  const roll = unit(card.id + ':ab')
  const ability = tier >= 3 || (tier === 2 && roll < 0.35) ? ABILITIES[hash(card.id + ':ability') % ABILITIES.length].id : null
  return { atk, def, element, abilities: ability ? [ability] : [], level }
}

// ───────────────────────── forge (custom cards) ─────────────────────────

export const FORGE = {
  maxCards: 3,
  maxLevel: 7,
  secondAbilityLevel: 5,
  budget: (level) => 8 + level * 2, // L1 10 points … L7 22 points
  upgradeCost: (level) => 400 * 2 ** (level - 1), // cost to go from `level` to level+1
}

export const FRAMES = [
  { id: 'basic', name: 'Basic Steel', price: 0, c1: '#9aa7b4', c2: '#3b4552' },
  { id: 'chrome', name: 'Chrome', price: 600, c1: '#e8f4ff', c2: '#5d6b7a' },
  { id: 'neon', name: 'Neon Grid', price: 1500, c1: '#39ff88', c2: '#0b3a22' },
  { id: 'circuit', name: 'Circuit', price: 3000, c1: '#4fc3ff', c2: '#0a2a4a' },
  { id: 'gilded', name: 'Gilded', price: 6000, c1: '#ffd166', c2: '#7a4a00' },
  { id: 'prism', name: 'Prism', price: 15000, c1: '#ffffff', c2: '#ff3df2' },
]
export const CARD_EFFECTS = [
  { id: 'matte', name: 'None', price: 0 },
  { id: 'glass', name: 'Glass Sheen', price: 800 },
  { id: 'rift', name: 'Pulse Glow', price: 2000 },
  { id: 'star', name: 'Starfoil Sparkle', price: 4000 },
  { id: 'void', name: 'Void Aura', price: 8000 },
  { id: 'origin', name: 'Holo Prism', price: 20000 },
]
export const ART_SCENES = ['hills', 'sea', 'city', 'crystal', 'nebula']
export const ART_PALETTES = ['nocturne', 'ember', 'signal', 'void', 'dawn']

export function validateCustom(input, { owned, level = 1 }) {
  const err = (m) => { throw Object.assign(new Error(m), { code: 'invalid' }) }
  const name = String(input.name || '').trim()
  if (!name) err('Give your card a name')
  if (name.length > 24) err('Card names are limited to 24 characters')
  const atk = Number(input.atk), def = Number(input.def)
  if (!Number.isInteger(atk) || !Number.isInteger(def) || atk < 1 || def < 1) err('ATK and DEF must each be at least 1')
  const budget = FORGE.budget(level)
  if (atk + def > budget) err(`Level ${level} cards have ${budget} stat points; this one uses ${atk + def}`)
  if (!ELEMENTS.some((e) => e.id === input.element)) err('Choose an element')
  const abilities = (input.abilities || []).filter(Boolean)
  if (abilities.length > (level >= FORGE.secondAbilityLevel ? 2 : 1)) err(`A second ability unlocks at level ${FORGE.secondAbilityLevel}`)
  if (new Set(abilities).size !== abilities.length) err('Pick two different abilities')
  for (const a of abilities) if (!ABILITIES.some((x) => x.id === a)) err('Unknown ability')
  if (!owned.frames.includes(input.frame)) err("You don't own that frame yet — buy it in the shop")
  if (!owned.effects.includes(input.effect)) err("You don't own that effect yet — buy it in the shop")
  const art = input.art || {}
  let cleanArt
  if (art.kind === 'upload' && art.imageKey) cleanArt = { kind: 'upload', imageKey: String(art.imageKey) }
  else if (art.kind === 'scene' && ART_SCENES.includes(art.scene) && ART_PALETTES.includes(art.palette)) cleanArt = { kind: 'scene', scene: art.scene, palette: art.palette, seed: String(art.seed || '1').slice(0, 24) }
  else err('Choose artwork for your card')
  const accent = /^#[0-9a-f]{6}$/i.test(input.accent || '') ? input.accent : '#39ff88'
  return { name, atk, def, element: input.element, abilities, frame: input.frame, effect: input.effect, art: cleanArt, accent, fit: input.fit === 'cover' ? 'cover' : 'contain' }
}

const beats = (a, b) => ELEMENTS.find((e) => e.id === a)?.beats === b
export { beats }

// ───────────────────────── lane battles ─────────────────────────
//
// Each side has a leader (25 HP), three lanes, a hand and an 8-card deck.
// Turn: refill energy (2 on your first turn, +1 a turn, max 6), draw a card,
// play cards into empty lanes for their energy cost, use tactics, then End
// Turn: every unit you have attacks down its lane — the enemy unit there, or
// the enemy leader if the lane is empty.
//
//   terrain   each lane has an element; a unit on its own element gets +2 ATK
//   element   attacking a unit whose element yours beats: +3 ATK
//   tactics   Fortify (1 energy): a unit blocks 4 from every hit until your next turn
//             Shift   (1 energy): move a unit to an empty lane (once a turn)
//
// A leader at 0 HP loses. After 10 turns each, the healthier leader wins.

export const LANES = 3
export const LEADER_HP = 25
export const HAND_START = 4
export const MAX_ENERGY = 6
export const TURN_LIMIT = 10
export const DECK_SIZE = 8
export const TERRAIN_BONUS = 2
export const TACTIC_COST = 1

// Always-available basic units that top up a deck when a player owns fewer
// than eight cards. Not collectible, not sellable, never bet.
export const RECRUITS = [
  { id: 'rc-ember', name: 'Cinder Recruit', art: 'gen:ember|hills|Cinder Recruit', stats: { atk: 3, def: 3, element: 'ember', abilities: [], level: 1 } },
  { id: 'rc-gale', name: 'Gale Recruit', art: 'gen:signal|crystal|Gale Recruit', stats: { atk: 2, def: 4, element: 'gale', abilities: [], level: 1 } },
  { id: 'rc-tide', name: 'Tide Recruit', art: 'gen:nocturne|sea|Tide Recruit', stats: { atk: 2, def: 4, element: 'tide', abilities: [], level: 1 } },
]

// Card stats → a unit on the table.
export function unitOf(stats) {
  const cost = Math.max(1, Math.min(5, 1 + Math.floor((stats.atk + stats.def) / 6)))
  return { atk: stats.atk, hp: stats.def + 3, maxHp: stats.def + 3, cost, element: stats.element, abilities: [...(stats.abilities || [])], level: stats.level ?? null }
}

const other = (side) => (side === 'you' ? 'them' : 'you')
const clone = (x) => JSON.parse(JSON.stringify(x))
let uidN = 0
const uidOf = () => 'u' + (++uidN).toString(36) + Math.floor(Math.random() * 1e6).toString(36)

function shuffle(list, rand) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

// decks: [{ ref, stats }]
export function newMatch(youDeck, themDeck, rand = randomInt) {
  const side = (deck) => ({
    leader: LEADER_HP, energy: 0, maxEnergy: 0, turns: 0, board: [null, null, null], hand: [],
    deck: shuffle(deck.map((c) => ({ id: uidOf(), ref: c.ref, unit: unitOf(c.stats) })), rand),
  })
  const m = {
    engine: 'lanes', turn: 'you', first: 'you', over: false,
    terrain: Array.from({ length: LANES }, () => ELEMENTS[rand(3)].id),
    you: side(youDeck), them: side(themDeck), events: [],
  }
  for (let k = 0; k < HAND_START; k++) { draw(m, 'you', true); draw(m, 'them', true) }
  startTurn(m, 'you')
  return m
}

export function snapOf(m) {
  const sd = (x) => ({ leader: x.leader, energy: x.energy, maxEnergy: x.maxEnergy, board: x.board.map((u) => (u ? { ...u } : null)), handCount: x.hand.length, deckCount: x.deck.length })
  return { you: sd(m.you), them: sd(m.them), turn: m.turn }
}
function ev(m, e) { m.events.push({ ...e, snap: snapOf(m) }) }

function draw(m, side, quiet) {
  const s = m[side]
  if (!s.deck.length) return
  const c = s.deck.shift()
  s.hand.push(c)
  if (!quiet) ev(m, { t: 'draw', side, card: side === 'you' ? c : null })
}

export function startTurn(m, side) {
  const s = m[side]
  m.turn = side
  s.turns += 1
  s.maxEnergy = Math.min(MAX_ENERGY, s.turns + 1)
  s.energy = s.maxEnergy
  ev(m, { t: 'turn', side, n: s.turns })
  for (let l = 0; l < LANES; l++) {
    const u = s.board[l]
    if (!u) continue
    u.fortify = false
    u.shifted = false
    if (u.burn) {
      u.hp -= u.burn
      ev(m, { t: 'burn', side, lane: l, dmg: u.burn })
      u.burn = 0
      if (u.hp <= 0) { s.board[l] = null; ev(m, { t: 'die', side, lane: l }) }
    }
  }
  if (!(side === m.first && s.turns === 1)) draw(m, side)
}

const has = (u, a) => u.abilities.includes(a)
export function attackOf(m, side, lane) {
  const me = m[side], foe = m[other(side)]
  const u = me.board[lane]
  if (!u) return null
  const t = foe.board[lane]
  const parts = [{ k: 'base', label: 'ATK', v: u.atk }]
  if (m.terrain[lane] === u.element) parts.push({ k: 'terrain', label: 'Terrain', v: TERRAIN_BONUS })
  if (t && beats(u.element, t.element)) parts.push({ k: 'element', label: 'Element', v: 3 })
  if (u.buff) parts.push({ k: 'rally', label: 'Rally', v: u.buff })
  if (has(u, 'surge') && me.leader < foe.leader) parts.push({ k: 'surge', label: 'Surge', v: 3 })
  if (u.hex) parts.push({ k: 'hex', label: 'Hexed', v: -u.hex })
  const atk = Math.max(0, parts.reduce((x, p) => x + p.v, 0))
  let dmg = atk, blocked = 0
  if (t) {
    blocked = (has(t, 'shield') ? 2 : 0) + (t.fortify ? 4 : 0)
    dmg = Math.max(0, atk - blocked)
  }
  return { atk, parts, target: t ? 'unit' : 'leader', dmg, blocked }
}

export function canPlay(m, side, handIdx, lane) {
  const s = m[side]
  const c = s.hand[handIdx]
  if (m.over) return 'The duel is over'
  if (m.turn !== side) return "It isn't your turn"
  if (!c) return 'Pick a card from your hand'
  if (!Number.isInteger(lane) || lane < 0 || lane >= LANES) return 'Pick a lane'
  if (s.board[lane]) return 'That lane is taken'
  if (c.unit.cost > s.energy) return `Not enough energy (needs ${c.unit.cost})`
  return null
}

export function playCard(m, side, handIdx, lane) {
  const err = canPlay(m, side, handIdx, lane)
  if (err) throw new Error(err)
  const s = m[side], foe = m[other(side)]
  const c = s.hand.splice(handIdx, 1)[0]
  s.energy -= c.unit.cost
  const u = { id: c.id, ref: c.ref, ...clone(c.unit), burn: 0, hex: 0, buff: 0, fortify: false, shifted: false }
  s.board[lane] = u
  ev(m, { t: 'play', side, lane, card: { id: c.id, ref: c.ref, unit: c.unit } })
  if (has(u, 'rally')) {
    for (const o of s.board) if (o && o !== u) o.buff = (o.buff || 0) + 2
    ev(m, { t: 'rally', side, lane })
  }
  if (has(u, 'hex') && foe.board[lane]) {
    foe.board[lane].hex = (foe.board[lane].hex || 0) + 3
    ev(m, { t: 'hex', side, lane })
  }
}

export function canTactic(m, side, kind, lane, toLane) {
  const s = m[side]
  const u = s.board[lane]
  if (m.over) return 'The duel is over'
  if (m.turn !== side) return "It isn't your turn"
  if (s.energy < TACTIC_COST) return 'Not enough energy'
  if (!u) return 'Pick one of your units'
  if (kind === 'fortify') return u.fortify ? 'Already fortified' : null
  if (kind === 'shift') {
    if (u.shifted) return 'It already moved this turn'
    if (!Number.isInteger(toLane) || toLane < 0 || toLane >= LANES || s.board[toLane]) return 'Pick an empty lane'
    return null
  }
  return 'Unknown tactic'
}

export function useTactic(m, side, kind, lane, toLane) {
  const err = canTactic(m, side, kind, lane, toLane)
  if (err) throw new Error(err)
  const s = m[side]
  s.energy -= TACTIC_COST
  if (kind === 'fortify') { s.board[lane].fortify = true; ev(m, { t: 'fortify', side, lane }) }
  else { const u = s.board[lane]; u.shifted = true; s.board[toLane] = u; s.board[lane] = null; ev(m, { t: 'shift', side, lane, toLane }) }
}

function battle(m, side) {
  const me = m[side], foe = m[other(side)]
  if (side === m.first && me.turns === 1) { ev(m, { t: 'nobattle', side }); return }
  for (let l = 0; l < LANES; l++) {
    const u = me.board[l]
    if (!u || m.over) continue
    const a = attackOf(m, side, l)
    const t = foe.board[l]
    if (t) {
      t.hp -= a.dmg
      let through = 0
      if (has(u, 'pierce') && t.hp < 0) { through = -t.hp; foe.leader -= through }
      if (has(u, 'burn') && a.dmg > 0) t.burn = 2
      let heal = 0
      if (has(u, 'drain') && a.dmg > 0) { heal = Math.floor(a.dmg / 2); me.leader = Math.min(LEADER_HP, me.leader + heal) }
      let back = 0
      if (t.hp > 0 && has(t, 'counter')) { back = Math.floor(t.atk / 2); u.hp -= back }
      ev(m, { t: 'attack', side, lane: l, target: 'unit', dmg: a.dmg, blocked: a.blocked, through, heal, back, parts: a.parts, burned: has(u, 'burn') && a.dmg > 0 })
      if (t.hp <= 0) { foe.board[l] = null; ev(m, { t: 'die', side: other(side), lane: l }) }
      if (u.hp <= 0) { me.board[l] = null; ev(m, { t: 'die', side, lane: l }) }
    } else {
      foe.leader -= a.dmg
      let heal = 0
      if (has(u, 'drain') && a.dmg > 0) { heal = Math.floor(a.dmg / 2); me.leader = Math.min(LEADER_HP, me.leader + heal) }
      ev(m, { t: 'attack', side, lane: l, target: 'leader', dmg: a.dmg, heal, parts: a.parts })
    }
    if (foe.leader <= 0 || me.leader <= 0) m.over = true
  }
  for (const u of me.board) if (u) u.buff = 0
}

// Ends `side`'s turn: its units attack, then the other side's turn starts.
export function endTurn(m, side) {
  if (m.over) throw new Error('The duel is over')
  if (m.turn !== side) throw new Error("It isn't your turn")
  battle(m, side)
  if (!m.over && m.you.turns >= TURN_LIMIT && m.them.turns >= TURN_LIMIT) { m.over = true; ev(m, { t: 'timeup' }) }
  if (!m.over) startTurn(m, other(side))
  if (m.you.leader <= 0 || m.them.leader <= 0) m.over = true
  if (m.over) m.turn = null
}

export function isOver(m) { return !!m.over }
export function outcome(m) {
  if (m.you.leader <= 0 && m.them.leader > 0) return 'lost'
  if (m.them.leader <= 0 && m.you.leader > 0) return 'won'
  return m.you.leader > m.them.leader ? 'won' : m.you.leader < m.them.leader ? 'lost' : 'draw'
}

// ───────────────────────── the rival's turn ─────────────────────────

function evaluate(m, side) {
  const me = m[side], foe = m[other(side)]
  if (foe.leader <= 0 && me.leader > 0) return 10000
  if (me.leader <= 0 && foe.leader > 0) return -10000
  const army = (s) => s.board.reduce((t, u) => t + (u ? u.atk * 1.4 + u.hp * 0.8 + u.abilities.length * 1.5 : 0), 0)
  const hand = (s) => s.hand.reduce((t, c) => t + c.unit.atk * 0.4 + c.unit.hp * 0.25, 0)
  return (me.leader - foe.leader) * 3 + army(me) - army(foe) + hand(me) * 0.5 - hand(foe) * 0.5
}

// Score a position by letting `side` attack and the other side swing back
// with what it has on the table (no new cards).
function lookahead(m, side) {
  const t = clone(m); t.events = []
  battle(t, side)
  if (!t.over) {
    const o = other(side)
    const saved = t[o].turns
    t[o].turns = Math.max(2, saved + 1) // make sure the reply is allowed to attack
    battle(t, o)
  }
  return evaluate(t, side)
}

// Plays the rival's cards and tactics for this turn (does not end the turn).
// Higher skill: more often picks the best-scoring move instead of a random one.
export function rivalPlays(m, skill, rand = randomInt) {
  const side = 'them'
  for (let guard = 0; guard < 12; guard++) {
    const s = m[side]
    const options = []
    s.hand.forEach((c, i) => { for (let l = 0; l < LANES; l++) if (!canPlay(m, side, i, l)) options.push({ kind: 'play', i, l }) })
    for (let l = 0; l < LANES; l++) if (s.board[l] && !canTactic(m, side, 'fortify', l)) options.push({ kind: 'fortify', l })
    if (!options.length) break
    const base = lookahead(m, side)
    const scored = options.map((o) => {
      const t = clone(m); t.events = []
      if (o.kind === 'play') playCard(t, side, o.i, o.l); else useTactic(t, side, 'fortify', o.l)
      return { ...o, v: lookahead(t, side) }
    })
    scored.sort((a, b) => b.v - a.v)
    let pickIt = scored[0]
    if (rand(1000) / 1000 > skill) pickIt = scored[rand(scored.length)]
    if (pickIt.v <= base && rand(1000) / 1000 < skill) break // nothing worth doing
    if (pickIt.kind === 'play') playCard(m, side, pickIt.i, pickIt.l); else useTactic(m, side, 'fortify', pickIt.l)
  }
}

// ───────────────────────── rivals ─────────────────────────

export const RIVALS = [
  { id: 'npc-mossbyte', name: 'mossbyte', level: 3, bio: 'new to orvel, collecting anything green', line: 'gl hf!', style: 'casual' },
  { id: 'npc-bao', name: 'Bao', level: 6, bio: 'Drift cards are underrated and I will die on this hill.', line: 'lets go', style: 'casual' },
  { id: 'npc-pixelpriya', name: 'pixelpriya', level: 10, bio: 'Lost Signal set or nothing ✦', line: 'good luck :)', style: 'steady' },
  { id: 'npc-tomask', name: 'tomas.k', level: 14, bio: 'evenings only. tide decks.', line: 'ready when you are', style: 'steady' },
  { id: 'npc-saltglass', name: 'saltglass', level: 18, bio: 'Hollowglass hoarder. no regrets.', line: 'hi hi', style: 'steady' },
  { id: 'npc-kaito88', name: 'Kaito.88', level: 23, bio: '3rd in the Ember cup. ask me about burn decks', line: "don't blink", style: 'sharp' },
  { id: 'npc-orbitaljo', name: 'Orbital Jo', level: 27, bio: 'Nocturne completionist (almost)', line: 'may the odds be odd', style: 'sharp' },
  { id: 'npc-hexen', name: 'hexen', level: 32, bio: 'I read your hand before you do.', line: 'your move.', style: 'sharp' },
  { id: 'npc-ruby', name: 'Ruby Vale', level: 38, bio: 'Starwrought collector. trades closed.', line: 'make it count', style: 'expert' },
  { id: 'npc-meridian', name: 'meridian_', level: 44, bio: 'top 50 last season', line: 'gg in advance', style: 'expert' },
  { id: 'npc-nyx', name: 'nyx_drift', level: 51, bio: 'Voidcrowned or bust.', line: '...', style: 'expert' },
  { id: 'npc-quietcomet', name: 'quietcomet', level: 58, bio: 'pulled Origin on my 4th pack. never recovered.', line: 'show me something', style: 'master' },
]

export const rivalSkill = (level) => Math.min(0.95, 0.15 + level * 0.014)
export const rivalBetCap = (level) => Math.max(100, level * 100) // coins
export const rivalCardCap = (level) => Math.max(500, level * 500) // max value of a wagered card

// A rival's starting record and streak: stable per rival, then updated by
// real results against the player.
export function rivalBaseRecord(r) {
  const u = unit(r.id + ':rec')
  const games = Math.round(40 + r.level * (18 + 22 * u))
  const rate = 0.42 + r.level * 0.006 + u * 0.06
  const wins = Math.round(games * Math.min(0.78, rate))
  return { wins, losses: games - wins, streak: Math.round(unit(r.id + ':streak') * (2 + r.level / 6)) }
}

// A rival's collection, generated from the live catalog so it always uses
// real cards. Higher levels own more and rarer cards. Limited editions are
// excluded so a rival never holds a copy that was never minted.
export function rivalCollection(r, cards, rarities) {
  const pool = cards.filter((c) => c.published && !c.limited?.enabled)
  if (!pool.length) return []
  const byTier = rarities.map((rar) => pool.filter((c) => c.rarityId === rar.id))
  const boost = 1 + r.level / 9
  const weights = rarities.map((rar, t) => (byTier[t].length ? Math.max(0.001, rar.weight) * boost ** (t * 1.6) : 0))
  const total = weights.reduce((a, b) => a + b, 0)
  const size = 10 + r.level * 2
  const counts = new Map()
  for (let k = 0; k < size; k++) {
    let x = unit(`${r.id}:pick:${k}`) * total, t = 0
    while (t < weights.length - 1 && x >= weights[t]) { x -= weights[t]; t++ }
    if (!byTier[t].length) continue
    const c = byTier[t][hash(`${r.id}:card:${k}`) % byTier[t].length]
    counts.set(c.id, (counts.get(c.id) || 0) + 1)
  }
  return [...counts.entries()].map(([cardId, count]) => ({ cardId, count }))
}

// ───────────────────────── avatar ─────────────────────────

// 12×12 pixel portrait, deterministic per seed. Returns rects for an SVG.
export function avatarPixels(seed) {
  const h = (k) => hash(seed + ':' + k)
  const skins = ['#f1c7a5', '#d9a07a', '#b97a56', '#8d5a3b', '#5e3b26', '#f6d7c3']
  const hairs = ['#1d1a1a', '#5a3825', '#c27c3a', '#e8d27a', '#d94f70', '#4fc3ff', '#9b6bff', '#e9e9e9', '#39ff88']
  const bgs = ['#12304a', '#3a1630', '#1d3a26', '#3a2a12', '#24183f', '#103a3a']
  const skin = skins[h('skin') % skins.length], hair = hairs[h('hair') % hairs.length], bg = bgs[h('bg') % bgs.length]
  const shirt = ['#ff7a45', '#4fc3ff', '#39ff88', '#ffd166', '#b388ff', '#ff5c8a'][h('shirt') % 6]
  const style = h('style') % 4
  const glasses = h('glasses') % 4 === 0
  const px = []
  const put = (x, y, c) => px.push({ x, y, c })
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) put(x, y, bg)
  // shoulders
  for (let y = 10; y < 12; y++) for (let x = 2; x < 10; x++) put(x, y, shirt)
  for (let x = 4; x < 8; x++) put(x, 9, skin)
  // head
  for (let y = 3; y < 9; y++) for (let x = 3; x < 9; x++) put(x, y, skin)
  // hair styles
  const hairRows = [
    [[3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [3, 3], [8, 3]],
    [[2, 2], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 2], [2, 3], [9, 3], [2, 4], [9, 4], [2, 5], [9, 5], [3, 3], [4, 3], [5, 3]],
    [[4, 1], [5, 1], [6, 1], [7, 1], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [3, 3], [8, 3], [3, 4], [8, 4], [2, 5], [9, 5], [2, 6], [9, 6], [2, 7], [9, 7]],
    [[5, 0], [6, 0], [4, 1], [5, 1], [6, 1], [7, 1], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [3, 3], [6, 3], [7, 3], [8, 3]],
  ][style]
  for (const [x, y] of hairRows) put(x, y, hair)
  // eyes and mouth
  put(4, 5, '#1a1a2a'); put(7, 5, '#1a1a2a')
  if (glasses) { for (const x of [3, 4, 5, 6, 7, 8]) put(x, 4, '#e8f4ff'); put(5, 5, '#e8f4ff'); put(6, 5, '#e8f4ff') }
  const mouth = h('mouth') % 3
  if (mouth === 0) { put(5, 7, '#7a3b3b'); put(6, 7, '#7a3b3b') }
  else if (mouth === 1) { put(4, 7, '#7a3b3b'); put(5, 7, '#7a3b3b'); put(6, 7, '#7a3b3b'); put(7, 7, '#7a3b3b') }
  else put(6, 7, '#7a3b3b')
  return px
}

