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
  { id: 'pierce', name: 'Pierce', text: "Ignores the enemy card's DEF." },
  { id: 'shield', name: 'Shield', text: 'Blocks 3 extra damage this round.' },
  { id: 'drain', name: 'Drain', text: 'Heals you for half the damage it deals.' },
  { id: 'rally', name: 'Rally', text: 'Your next card gets +3 ATK.' },
  { id: 'burn', name: 'Burn', text: 'The enemy takes 2 damage at the start of next round.' },
  { id: 'surge', name: 'Surge', text: '+4 ATK while you have less HP than the enemy.' },
]

export const MAX_HP = 30
export const DECK_SIZE = 5

function hash(text) {
  let h = 2166136261
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return h >>> 0
}
const unit = (text) => (hash(text) % 10007) / 10006

// Battle stats for a catalog card: rarer and more valuable means stronger.
export function cardStats(card, tier, valueInRangeUnit = 0.5) {
  const total = 6 + tier * 3 + Math.round(2 * valueInRangeUnit)
  const r = 0.35 + 0.3 * unit(card.id + ':split')
  const atk = Math.max(1, Math.round(total * r))
  const def = Math.max(1, total - atk)
  const element = ELEMENTS[hash(card.id + ':el') % 3].id
  const roll = unit(card.id + ':ab')
  const ability = tier >= 3 || (tier === 2 && roll < 0.35) ? ABILITIES[hash(card.id + ':ability') % ABILITIES.length].id : null
  return { atk, def, element, abilities: ability ? [ability] : [] }
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

// ───────────────────────── a round ─────────────────────────

const beats = (a, b) => ELEMENTS.find((e) => e.id === a)?.beats === b

// Resolves one round. `side` objects: { hp, rally, burn } carried between
// rounds. Returns new sides and a log entry. Pure: no randomness.
export function resolveRound(pCard, nCard, pSide, nSide) {
  const P = { ...pSide }, N = { ...nSide }
  const notes = []
  // burn from last round lands first
  if (P.burn) { P.hp -= P.burn; notes.push({ who: 'p', text: `Burn ${P.burn}` }) }
  if (N.burn) { N.hp -= N.burn; notes.push({ who: 'n', text: `Burn ${N.burn}` }) }
  P.burn = 0; N.burn = 0

  const has = (c, a) => c.abilities.includes(a)
  const atkOf = (me, them, meSide, themSide, who) => {
    let atk = me.atk + (meSide.rally || 0)
    if (meSide.rally) notes.push({ who, text: `Rally +${meSide.rally}` })
    if (beats(me.element, them.element)) { atk += ELEMENT_BONUS; notes.push({ who, text: `Element +${ELEMENT_BONUS}` }) }
    if (has(me, 'surge') && meSide.hp < themSide.hp) { atk += 4; notes.push({ who, text: 'Surge +4' }) }
    return atk
  }
  const aP = atkOf(pCard, nCard, P, N, 'p')
  const aN = atkOf(nCard, pCard, N, P, 'n')
  const dmg = (atk, me, them) => {
    let d = has(me, 'pierce') ? atk : Math.max(1, atk - Math.floor(them.def * 0.6))
    if (has(them, 'shield')) d = Math.max(0, d - 3)
    return d
  }
  const toN = dmg(aP, pCard, nCard)
  const toP = dmg(aN, nCard, pCard)
  N.hp -= toN; P.hp -= toP
  if (has(pCard, 'drain') && toN > 0) { const h = Math.floor(toN / 2); P.hp = Math.min(MAX_HP, P.hp + h); notes.push({ who: 'p', text: `Drain +${h}` }) }
  if (has(nCard, 'drain') && toP > 0) { const h = Math.floor(toP / 2); N.hp = Math.min(MAX_HP, N.hp + h); notes.push({ who: 'n', text: `Drain +${h}` }) }
  P.rally = has(pCard, 'rally') ? 3 : 0
  N.rally = has(nCard, 'rally') ? 3 : 0
  if (has(pCard, 'burn')) N.burn = 2
  if (has(nCard, 'burn')) P.burn = 2
  return { P, N, entry: { toN, toP, aP, aN, notes } }
}

// How the rival picks a card. It never sees which card the player chose this
// round; it reasons only about the player's remaining hand. Higher-level
// rivals pick well more often and weigh their worst case more heavily.
export function npcChoose(nHand, pHand, pSide, nSide, skill) {
  const mine = nHand.map((c, i) => ({ c, i })).filter((x) => !x.c.used)
  const theirs = pHand.filter((c) => !c.used)
  if (mine.length === 1) return mine[0].i
  if (randomInt(1000) / 1000 > skill) return mine[randomInt(mine.length)].i
  let best = null
  for (const m of mine) {
    const outcomes = theirs.map((t) => { const r = resolveRound(t.stats, m.c.stats, pSide, nSide); return (r.N.hp - r.P.hp) })
    const avg = outcomes.reduce((a, b) => a + b, 0) / outcomes.length
    const worst = Math.min(...outcomes)
    const score = avg * (1 - skill * 0.5) + worst * skill * 0.5
    if (!best || score > best.score) best = { i: m.i, score }
  }
  return best.i
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
