// ORVEL game server.
//
// Every rule that matters — what a pack costs, what it contains, what a sale
// pays, who may edit the catalog — lives here and nowhere else. The UI never
// changes balances or inventory itself; it calls these functions and renders
// what they return.
//
// In the prototype this module runs in the browser against IndexedDB, which
// means a determined player with devtools could edit their own save. That is
// acceptable for a single-player prototype and is exactly why this file is
// written as a server: in production the same functions move behind an
// authenticated API (see docs/PRODUCTION.md) and the client keeps nothing but
// a read-only snapshot.

import {
  DEFAULT_RARITIES, DEFAULT_COLLECTIONS, DEFAULT_PACKS, DEFAULT_RANKS,
  DEFAULT_XP_RULES, DEFAULT_SETTINGS, EFFECTS, V1_RARITY_DEFAULTS, V1_PACK_PRICES, XP_BATTLE, DAILY_REWARDS,
} from './defaults.js'
import {
  cardStats, validateCustom, newMatch, playCard as lanePlay, useTactic as laneTactic, endTurn as laneEnd, rivalPlays, outcome,
  RECRUITS, RIVALS, rivalSkill, rivalBetCap, rivalCardCap,
  rivalBaseRecord, rivalCollection, FORGE, FRAMES, CARD_EFFECTS, MAX_HP, DECK_SIZE, rollLevel, STARTERS, BENCH, MAPS, LANES,
} from './battle.js'
import { randomInt, weightedPick, uid } from './rng.js'

const STATE_KEY = 'orvel:state:v1'
const MAX_TX = 5000
const PLAYER = 'local'
const TUTORIAL_REWARD = 300

export class GameError extends Error {
  constructor(code, message) { super(message); this.code = code }
}
const fail = (code, msg) => { throw new GameError(code, msg) }

const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)))
const isInt = (n) => Number.isInteger(n)
const today = (now) => new Date(now).toISOString().slice(0, 10)

function freshPlayer(settings, now) {
  return {
    id: PLAYER, name: 'Collector', cash: settings.startingCash, xp: 0,
    inventory: {}, // cardId -> { count, serials: [], levels: [] } (one level per copy)
    stats: { packsOpened: 0, cardsPulled: 0, cardsSold: 0, cashEarned: 0, cashSpent: 0 },
    lastDaily: null, createdAt: now,
    customs: [], cosmetics: { frames: ['basic'], effects: ['matte'] },
    battle: { wins: 0, losses: 0, draws: 0, streak: 0, best: 0 },
    signin: { day: 0 },
  }
}

export function freshState(now = Date.now()) {
  const settings = clone(DEFAULT_SETTINGS)
  return {
    version: 6,
    settings,
    rarities: clone(DEFAULT_RARITIES),
    collections: clone(DEFAULT_COLLECTIONS),
    packs: clone(DEFAULT_PACKS),
    ranks: clone(DEFAULT_RANKS),
    xpRules: clone(DEFAULT_XP_RULES),
    cards: [],
    nextCode: 1,
    players: { [PLAYER]: freshPlayer(settings, now) },
    transactions: [],
    orders: [],
    admin: { pinHash: null, salt: null },
    paymentSecret: uid('whsec_'),
    rivals: {},
    battles: [],
  }
}

// ───────────────────────── pure helpers (also used by the UI) ─────────────

// A deterministic value inside a rarity's range, weighted toward the low end
// so high values stay special. Used for sample cards and the editor's dice.
const STEPS = [[100000, 2500], [10000, 250], [1000, 25], [200, 10], [60, 5], [0, 1]]
export function valueInRange(min, max, u) {
  if (!(max > min)) return min
  const raw = min + (max - min) * u * u
  const step = STEPS.find(([lim]) => max >= lim)[1]
  return Math.min(max, Math.max(min, Math.round(raw / step) * step))
}
export function seededUnit(text) {
  let h = 2166136261
  for (const ch of String(text)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return ((h >>> 0) % 10007) / 10006
}

// Average sell-back value of one opened pack, using the same pool and odds as
// the draw. If this is above the pack's price, players can buy packs, sell
// the cards and come out ahead — a currency printer.
export function packExpectedValue(state, pack) {
  const pool = packPool(state, pack)
  if (!pool.length) return 0
  const avg = {}
  for (const r of state.rarities) {
    const cs = pool.filter((c) => c.rarityId === r.id)
    if (cs.length) avg[r.id] = cs.reduce((t, c) => t + cardValue(state, c), 0) / cs.length
  }
  const slot = (minIdx) => {
    const w = packWeights(state, pack).filter((x) => avg[x.rarity.id] != null && rarityIndex(state, x.rarity.id) >= minIdx && x.weight > 0)
    const tot = w.reduce((t, x) => t + x.weight, 0)
    return tot ? w.reduce((t, x) => t + (x.weight / tot) * avg[x.rarity.id], 0) : 0
  }
  const g = pack.guarantee?.minRarityId ? rarityIndex(state, pack.guarantee.minRarityId) : null
  const n = Number(pack.cardCount) || 0
  return g != null && n > 0 ? slot(0) * (n - 1) + slot(g) : slot(0) * n
}

// Brings older saves up to the current economy without touching anything the
// creator has customised.
export function migrate(s) {
  if ((s.version || 1) < 2) {
    for (const r of s.rarities) {
      const d = DEFAULT_RARITIES.find((x) => x.id === r.id)
      const v1 = V1_RARITY_DEFAULTS[r.id]
      if (d && v1 && r.weight === v1[0] && r.sellValue === v1[1]) Object.assign(r, { weight: d.weight, sellValue: d.sellValue, minValue: d.minValue, maxValue: d.maxValue })
      if (r.minValue == null) { r.minValue = r.sellValue; r.maxValue = r.sellValue }
    }
    for (const c of s.cards) {
      if (c.sample && c.sellValue == null) {
        const r = s.rarities.find((x) => x.id === c.rarityId)
        if (r) c.sellValue = valueInRange(r.minValue, r.maxValue, seededUnit(c.name))
      }
    }
    for (const p of s.packs) {
      const d = DEFAULT_PACKS.find((x) => x.id === p.id)
      if (d && p.priceCash === V1_PACK_PRICES[p.id]) { p.priceCash = d.priceCash; p.rarityWeights = clone(d.rarityWeights) }
    }
    if (s.settings.dailyReward === 75) s.settings.dailyReward = DEFAULT_SETTINGS.dailyReward
    s.version = 2
  }
  if (s.version < 3) {
    // v3: the top two rarities became rarer, and the Arena and Forge arrived
    const r5 = s.rarities.find((r) => r.id === 'r5'), r6 = s.rarities.find((r) => r.id === 'r6')
    if (r5 && r5.weight === 18) r5.weight = 12
    if (r6 && r6.weight === 2) r6.weight = 1
    const vault = s.packs.find((p) => p.id === 'pk-void')
    if (vault?.rarityWeights?.r5 === 90 && vault.rarityWeights.r6 === 10) { vault.rarityWeights.r5 = 60; vault.rarityWeights.r6 = 5 }
    s.rivals ||= {}
    s.battles ||= []
    for (const p of Object.values(s.players)) {
      p.customs ||= []
      p.cosmetics ||= { frames: ['basic'], effects: ['matte'] }
      p.battle ||= { wins: 0, losses: 0, draws: 0, streak: 0, best: 0 }
    }
    s.version = 3
  }
  if (s.version < 4) {
    // v4: turn-based duels and the 30-day sign-in. A duel still running
    // under the old rules is cancelled and its bet returned.
    for (const m of s.battles) {
      if (m.status !== 'active' || m.turn !== undefined) continue
      const p = s.players[m.player]
      if (p && m.wager?.type === 'coins') p.cash += m.wager.amount || 0
      if (p && m.wager?.type === 'card') {
        const inv = p.inventory[m.wager.cardId] || (p.inventory[m.wager.cardId] = { count: 0, serials: [] })
        inv.count += 1
        if (m.wager.serial != null) inv.serials.push(m.wager.serial)
      }
      m.status = 'cancelled'
    }
    for (const p of Object.values(s.players)) p.signin ||= { day: 0 }
    s.version = 4
  }
  if (s.version < 5) {
    // v5: lane battles. A duel still running under the turn-based rules is
    // cancelled and its bet returned.
    for (const m of s.battles) if (m.status === 'active' && !m.game) refundBattle(s, m)
    s.version = 5
  }
  if (s.version < 6) s.version = 6
  // five lanes: a duel still running on the old three-lane field is
  // cancelled and its bet returned (checked on every load, like levels below)
  for (const m of s.battles || []) if (m.status === 'active' && m.game && m.game.you?.board?.length !== LANES) refundBattle(s, m)
  // v6: card levels. Every copy owned before levels existed rolls one now, by
  // the same rule as a fresh pull. This runs on every load rather than once
  // behind the version number, because on the server the catalog (which
  // carries the version) and each player's save are stored apart: the first
  // player to load would bump the version for everyone else.
  for (const p of Object.values(s.players || {})) {
    for (const [cardId, inv] of Object.entries(p.inventory || {})) {
      if (inv.levels?.length === inv.count) continue
      const card = s.cards.find((c) => c.id === cardId)
      inv.levels ||= []
      while (inv.levels.length < inv.count) inv.levels.push(card ? rollCardLevel(s, card) : 1)
      inv.levels.length = Math.max(0, inv.count)
    }
  }
  return s
}

function refundBattle(s, m) {
  const p = s.players[m.player]
  if (p && m.wager?.type === 'coins') p.cash += m.wager.amount || 0
  if (p && m.wager?.type === 'card') {
    const inv = p.inventory[m.wager.cardId] || (p.inventory[m.wager.cardId] = { count: 0, serials: [] })
    addCopy(inv, m.wager.level ?? 1)
    if (m.wager.serial != null) inv.serials.push(m.wager.serial)
  }
  m.status = 'cancelled'
}

export function rarityIndex(state, rarityId) {
  return state.rarities.findIndex((r) => r.id === rarityId)
}

export function cardValue(state, card) {
  if (card.sellValue != null) return card.sellValue
  const r = state.rarities.find((x) => x.id === card.rarityId)
  return r ? r.sellValue : 0
}

// Levels: one per copy. The best copy is the one you fight with; selling or
// betting a spare always gives up the lowest.
export function rollCardLevel(state, card) {
  return rollLevel(Math.max(0, rarityIndex(state, card.rarityId)), randomInt(1000000) / 1000000)
}
export const bestLevel = (inv) => (inv?.levels?.length ? Math.max(...inv.levels) : null)
function addCopy(inv, level) { inv.count += 1; (inv.levels ||= []).push(level) }
function takeLowest(inv) {
  inv.count -= 1
  if (!inv.levels?.length) return null
  const i = inv.levels.indexOf(Math.min(...inv.levels))
  return inv.levels.splice(i, 1)[0]
}

export function rankFor(ranks, xp) {
  let cur = ranks[0], next = null
  for (let i = 0; i < ranks.length; i++) {
    if (xp >= ranks[i].xp) { cur = ranks[i]; next = ranks[i + 1] || null }
  }
  const idx = ranks.indexOf(cur)
  const progress = next ? (xp - cur.xp) / (next.xp - cur.xp) : 1
  return { rank: cur, next, index: idx, progress: Math.max(0, Math.min(1, progress)) }
}

function limitedAvailable(card) {
  if (!card.limited?.enabled) return Infinity
  return Math.max(0, card.limited.editionSize - (card.limited.minted || 0))
}

export function packPool(state, pack) {
  return state.cards.filter((c) =>
    c.published &&
    (pack.poolMode === 'all' || (c.packIds || []).includes(pack.id)) &&
    limitedAvailable(c) > 0,
  )
}

function packWeights(state, pack) {
  return state.rarities.map((r) => ({
    rarity: r,
    weight: Math.max(0, Number(pack.rarityWeights?.[r.id] ?? r.weight) || 0),
  }))
}

// The odds a player is shown are computed by the same code that draws, from
// the same pool, so the disclosure can never drift from the behaviour.
export function packOdds(state, pack) {
  const pool = packPool(state, pack)
  const present = new Set(pool.map((c) => c.rarityId))
  const w = packWeights(state, pack).filter((x) => present.has(x.rarity.id) && x.weight > 0)
  const total = w.reduce((s, x) => s + x.weight, 0)
  const standard = state.rarities.map((r) => {
    const e = w.find((x) => x.rarity.id === r.id)
    return { rarityId: r.id, name: r.name, pct: e && total ? (e.weight / total) * 100 : 0, cards: pool.filter((c) => c.rarityId === r.id).length }
  })
  let guaranteed = null
  if (pack.guarantee?.minRarityId) {
    const minIdx = rarityIndex(state, pack.guarantee.minRarityId)
    const gw = w.filter((x) => rarityIndex(state, x.rarity.id) >= minIdx)
    const gt = gw.reduce((s, x) => s + x.weight, 0)
    guaranteed = {
      minRarityId: pack.guarantee.minRarityId,
      odds: state.rarities.map((r) => {
        const e = gw.find((x) => x.rarity.id === r.id)
        return { rarityId: r.id, name: r.name, pct: e && gt ? (e.weight / gt) * 100 : 0 }
      }),
    }
  }
  return { standard, guaranteed, poolSize: pool.length }
}

export function packStatus(state, pack, now = Date.now()) {
  if (!pack.active) return { ok: false, reason: 'Not currently available' }
  if (pack.limited?.enabled) {
    if (pack.limited.sold >= pack.limited.stock) return { ok: false, reason: 'Sold out' }
    if (pack.limited.endsAt && now > new Date(pack.limited.endsAt).getTime()) return { ok: false, reason: 'Offer ended' }
  }
  const pool = packPool(state, pack)
  if (!pool.length) return { ok: false, reason: 'No cards available for this pack yet' }
  if (pack.guarantee?.minRarityId) {
    const minIdx = rarityIndex(state, pack.guarantee.minRarityId)
    const ok = pool.some((c) => rarityIndex(state, c.rarityId) >= minIdx &&
      Number(pack.rarityWeights?.[c.rarityId] ?? state.rarities[rarityIndex(state, c.rarityId)].weight) > 0)
    if (!ok) return { ok: false, reason: 'Its guaranteed rarity has no cards yet' }
  }
  return { ok: true }
}

// ───────────────────────── server ─────────────────────────

/**
 * storage: { get(key) -> Promise<any>, set(key, value) -> Promise<void> }
 */
// adminCheck: when given (server/accounts mode), creator access comes from the
// signed-in account instead of the PIN sessions below.
export function createGameServer(storage, { now = () => Date.now(), adminCheck = null } = {}) {
  let state = null
  let queue = Promise.resolve()
  const adminSessions = new Set()

  // All calls run one at a time. Two rapid taps on "Buy" are two sequential
  // purchases checked against the balance each time, never two reads of the
  // same balance.
  function serial(fn) {
    const run = queue.then(async () => {
      if (!state) state = migrate((await storage.get(STATE_KEY)) || freshState(now()))
      const draft = clone(state)
      const result = await fn(draft)
      await storage.set(STATE_KEY, draft) // commit only after success
      state = draft
      return clone(result)
    })
    queue = run.catch(() => {})
    return run
  }
  const read = (fn) => serial((s) => fn(s))

  const player = (s) => s.players[PLAYER]
  const requireAdmin = (token) => {
    if (adminCheck) { if (!adminCheck()) fail('forbidden', 'Only the creator account can do that'); return }
    if (!token || !adminSessions.has(token)) fail('forbidden', 'Admin sign-in required')
  }

  function log(s, entry) {
    s.transactions.push({ id: uid('tx_'), at: now(), player: PLAYER, ...entry })
    if (s.transactions.length > MAX_TX) s.transactions.splice(0, s.transactions.length - MAX_TX)
  }

  function addXp(s, amount) { player(s).xp += Math.max(0, Math.round(amount)) }

  // Draw and award one pack. Caller has already taken payment.
  function rollPack(s, pack) {
    const status = packStatus(s, pack, now())
    if (!status.ok) fail('unavailable', status.reason)
    const p = player(s)
    const pool = packPool(s, pack)
    const remaining = new Map(pool.map((c) => [c.id, limitedAvailable(c)]))
    const weights = packWeights(s, pack)
    const results = []

    for (let slot = 0; slot < pack.cardCount; slot++) {
      const guaranteedSlot = pack.guarantee?.minRarityId && slot === pack.cardCount - 1
      const minIdx = guaranteedSlot ? rarityIndex(s, pack.guarantee.minRarityId) : 0
      const live = pool.filter((c) => remaining.get(c.id) > 0)
      const present = new Set(live.map((c) => c.rarityId))
      const rarityId = weightedPick(weights
        .filter((x) => present.has(x.rarity.id) && rarityIndex(s, x.rarity.id) >= minIdx)
        .map((x) => ({ value: x.rarity.id, weight: x.weight })))
      if (!rarityId) fail('unavailable', 'This pack ran out of eligible cards')
      const choices = live.filter((c) => c.rarityId === rarityId)
      const card = choices[randomInt(choices.length)]
      remaining.set(card.id, remaining.get(card.id) - 1)

      const real = s.cards.find((c) => c.id === card.id)
      let serialNo = null
      if (real.limited?.enabled) {
        real.limited.minted = (real.limited.minted || 0) + 1
        serialNo = real.limited.minted
      }
      const inv = p.inventory[card.id] || (p.inventory[card.id] = { count: 0, serials: [] })
      const isNew = inv.count === 0 && !results.some((r) => r.cardId === card.id) && !inv.everOwned
      const level = rollCardLevel(s, real)
      addCopy(inv, level)
      inv.everOwned = true
      if (serialNo) inv.serials.push(serialNo)

      const r = s.rarities[rarityIndex(s, rarityId)]
      addXp(s, r.xp || 0)
      if (isNew) addXp(s, s.xpRules.perNewCard)
      results.push({ cardId: card.id, rarityId, serial: serialNo, isNew, level })
    }

    addXp(s, s.xpRules.perPack)
    if (pack.limited?.enabled) pack.limited.sold += 1
    p.stats.packsOpened += 1
    p.stats.cardsPulled += results.length
    const opening = { id: uid('open_'), packId: pack.id, at: now(), cards: results }
    log(s, { type: 'pack_open', packId: pack.id, packName: pack.name, openingId: opening.id, cards: results.map((r) => r.cardId) })
    return opening
  }

  async function hashPin(pin, salt) {
    const data = new TextEncoder().encode(`${salt}:${pin}`)
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
  }

  async function hmac(secret, message) {
    const key = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await globalThis.crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
    return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
  }

  function validateCard(s, input, existing) {
    const name = String(input.name || '').trim()
    if (!name) fail('invalid', 'Every card needs a name')
    if (name.length > 80) fail('invalid', 'Card names are limited to 80 characters')
    const dupe = s.cards.find((c) => c.id !== existing?.id && c.name.toLowerCase() === name.toLowerCase())
    if (dupe) fail('invalid', `"${dupe.name}" already exists (${dupe.code}). Card names must be unique.`)
    if (!s.rarities.some((r) => r.id === input.rarityId)) fail('invalid', 'Choose a rarity')
    const num = Number(input.collectionNumber)
    if (!isInt(num) || num < 1) fail('invalid', 'Collection number must be a whole number of 1 or more')
    const numDupe = s.cards.find((c) => c.id !== existing?.id && c.collectionNumber === num)
    if (numDupe) fail('invalid', `Collection number ${num} is already used by "${numDupe.name}"`)
    let sellValue = input.sellValue === '' || input.sellValue == null ? null : Number(input.sellValue)
    if (sellValue != null && (!isInt(sellValue) || sellValue < 0)) fail('invalid', 'Selling value must be a whole number of 0 or more')
    const limited = { enabled: !!input.limited?.enabled, editionSize: Number(input.limited?.editionSize) || 0, minted: existing?.limited?.minted || 0 }
    if (limited.enabled) {
      if (!isInt(limited.editionSize) || limited.editionSize < 1) fail('invalid', 'A limited edition needs an edition size of at least 1')
      if (limited.editionSize < limited.minted) fail('invalid', `${limited.minted} copies already exist; the edition size can't go below that`)
    }
    if (!input.imageKey && !input.imageUrl) fail('invalid', 'Upload the artwork first')
    return {
      name,
      description: String(input.description || '').trim().slice(0, 2000),
      rarityId: input.rarityId,
      collectionNumber: num,
      sellValue,
      packIds: (input.packIds || []).filter((id) => s.packs.some((p) => p.id === id)),
      collectionIds: (input.collectionIds || []).filter((id) => s.collections.some((c) => c.id === id)),
      limited,
      imageKey: input.imageKey || null,
      imageUrl: input.imageUrl || null,
      imageW: input.imageW || null,
      imageH: input.imageH || null,
      fit: input.fit === 'cover' ? 'cover' : 'contain',
      published: !!input.published,
      sample: !!existing?.sample && input.sample !== false,
    }
  }

  function ownedByAnyone(s, cardId) {
    return Object.values(s.players).some((p) => (p.inventory[cardId]?.count || 0) > 0)
  }

  // ── arena helpers ──
  function valueUnit(s, card) {
    const r = s.rarities.find((x) => x.id === card.rarityId)
    if (!r || !(r.maxValue > r.minValue)) return 0.5
    return Math.max(0, Math.min(1, (cardValue(s, card) - r.minValue) / (r.maxValue - r.minValue)))
  }
  function statsOfCard(s, card, level = null) { return cardStats(card, Math.max(0, rarityIndex(s, card.rarityId)), valueUnit(s, card), level) }
  // a rival's copies are levelled by how strong the rival is
  const rivalLevelOf = (s, r, card) => rollLevel(Math.max(0, rarityIndex(s, card.rarityId)), Math.min(1, 0.15 + (r.level / 60) * 0.6 + 0.25 * seededUnit(r.id + ':' + card.id)))
  const powerOf = (st) => st.atk + st.def + st.abilities.length * 3

  function rivalRecord(s, r) {
    return (s.rivals[r.id] ||= { ...rivalBaseRecord(r), taken: [] })
  }
  function rivalCards(s, r) {
    const rec = s.rivals[r.id]
    const base = rivalCollection(r, s.cards, s.rarities)
    for (const id of rec?.taken || []) {
      const e = base.find((x) => x.cardId === id)
      if (e) e.count += 1; else base.push({ cardId: id, count: 1 })
    }
    return base.map((e) => {
      const card = s.cards.find((c) => c.id === e.cardId)
      if (!card) return null
      const level = rivalLevelOf(s, r, card)
      const stats = statsOfCard(s, card, level)
      return { ...e, value: cardValue(s, card), rarityId: card.rarityId, level, stats, power: powerOf(stats) }
    }).filter(Boolean)
  }
  function rivalSummary(s, r) {
    const rec = s.rivals[r.id] || { ...rivalBaseRecord(r), taken: [] }
    const cards = rivalCards(s, r)
    const fav = cards.slice().sort((a, b) => b.value - a.value)[0] || null
    const top = cards.slice().sort((a, b) => b.power - a.power).slice(0, STARTERS + BENCH)
    return {
      id: r.id, name: r.name, level: r.level, bio: r.bio, line: r.line, style: r.style,
      wins: rec.wins, losses: rec.losses, streak: rec.streak,
      betCap: rivalBetCap(r.level), cardCap: rivalCardCap(r.level),
      deckPower: top.reduce((t, c) => t + c.power, 0),
      favoriteCardId: fav?.cardId || null, uniqueCards: cards.length, totalCards: cards.reduce((t, c) => t + c.count, 0),
    }
  }
  function checkWager(s, r, wager, deck) {
    const p = player(s)
    const w = wager || { type: 'coins', amount: 0 }
    if (w.type === 'coins') {
      const amount = Number(w.amount) || 0
      if (!isInt(amount) || amount < 0) fail('invalid', 'Bets are whole numbers')
      if (amount > rivalBetCap(r.level)) fail('cap', `${r.name} plays for at most ${rivalBetCap(r.level).toLocaleString()} coins`)
      if (amount > p.cash) fail('funds', `Not enough ${s.settings.currencyName}`)
      return { type: 'coins', amount }
    }
    if (w.type === 'card') {
      const card = s.cards.find((c) => c.id === w.cardId)
      const inv = p.inventory[w.cardId]
      if (!card || !inv || inv.count < 1) fail('not_owned', "You can only bet a card you own")
      const inDeck = (deck || []).some((d) => d.kind === 'card' && d.id === w.cardId)
      if (inDeck && inv.count < 2) fail('invalid', 'That card is in your deck — bet a different card or a spare copy')
      const value = cardValue(s, card)
      if (value > rivalCardCap(r.level)) fail('cap', `${r.name} only accepts cards worth up to ${rivalCardCap(r.level).toLocaleString()}`)
      return { type: 'card', cardId: card.id, cardName: card.name, value }
    }
    fail('invalid', 'Unknown bet')
  }
  function rivalStake(s, r, w) {
    if (w.type === 'coins') return { type: 'coins', amount: w.amount }
    // a card from the rival's collection close in value; otherwise the closest in the catalog
    const near = (list) => list.slice().sort((a, b) => Math.abs(a.value - w.value) - Math.abs(b.value - w.value) || b.value - a.value)[0]
    const theirs = rivalCards(s, r).filter((c) => c.value >= w.value * 0.75 && c.value <= w.value * 1.35)
    let pick = near(theirs)
    if (!pick) pick = near(s.cards.filter((c) => c.published && !c.limited?.enabled).map((c) => ({ cardId: c.id, value: cardValue(s, c) })))
    const card = s.cards.find((c) => c.id === pick.cardId)
    return { type: 'card', cardId: card.id, cardName: card.name, value: cardValue(s, card), rarityId: card.rarityId, level: pick.level ?? rivalLevelOf(s, r, card) }
  }
  // Starters and bench. An older client sends one `deck`: its first three
  // become starters and the rest the bench.
  function checkLineup(s, p, { starters, bench, deck }, w) {
    if (!starters && Array.isArray(deck)) { starters = deck.slice(0, STARTERS); bench = deck.slice(STARTERS) }
    starters ||= []; bench ||= []
    if (!Array.isArray(starters) || starters.length > STARTERS) fail('invalid', `Pick up to ${STARTERS} starters`)
    if (!Array.isArray(bench) || bench.length > BENCH) fail('invalid', `Pick up to ${BENCH} cards for the bench`)
    const all = checkDeck(s, p, [...starters, ...bench], w, STARTERS + BENCH, false)
    const st = all.slice(0, starters.length), bn = all.slice(starters.length)
    let k = 0
    const fill = (list, n) => { const out = [...list]; while (out.length < n) { const rc = RECRUITS[k++ % RECRUITS.length]; out.push({ ref: { kind: 'recruit', id: rc.id }, stats: rc.stats }) } return out }
    return { starters: fill(st, STARTERS), bench: fill(bn, BENCH) }
  }
  function checkDeck(s, p, deck, w, max = DECK_SIZE, fillUp = true) {
    if (!Array.isArray(deck) || deck.length > max) fail('invalid', `Pick up to ${max} cards`)
    const seen = new Set()
    const picked = deck.map((ref) => {
      const key = `${ref?.kind}:${ref?.id}`
      if (seen.has(key)) fail('invalid', 'Each card can be in your lineup once')
      seen.add(key)
      if (ref.kind === 'card') {
        const card = s.cards.find((c) => c.id === ref.id)
        const have = p.inventory[ref.id]?.count || 0
        const need = 1 + (w.type === 'card' && w.cardId === ref.id ? 1 : 0)
        if (!card || have < need) fail('not_owned', 'Your deck can only use cards you own')
        return { ref: { kind: 'card', id: card.id }, stats: statsOfCard(s, card, bestLevel(p.inventory[ref.id]) ?? 1) }
      }
      if (ref.kind === 'custom') {
        const c = p.customs.find((x) => x.id === ref.id)
        if (!c) fail('not_owned', 'That custom card no longer exists')
        return { ref: { kind: 'custom', id: c.id }, stats: { atk: c.atk, def: c.def, element: c.element, abilities: c.abilities } }
      }
      fail('invalid', 'Unknown card in deck')
    })
    return fillUp ? fillRecruits(picked) : picked
  }
  function fillRecruits(list) {
    const out = [...list]
    for (let k = 0; out.length < DECK_SIZE; k++) { const rc = RECRUITS[k % RECRUITS.length]; out.push({ ref: { kind: 'recruit', id: rc.id }, stats: rc.stats }) }
    return out
  }
  // What the player may see: their own hand, but only counts for the rival's
  // hand and both decks.
  function battleView(s, m) {
    const r = RIVALS.find((x) => x.id === m.rivalId)
    const g = m.game
    const side = (x, mine) => ({
      leader: x.leader, energy: x.energy, maxEnergy: x.maxEnergy, turns: x.turns, board: x.board,
      handCount: x.hand.length, deckCount: x.deck.length, out: x.out || [], ...(mine ? { hand: x.hand } : {}),
    })
    return clone({
      id: m.id, rivalId: m.rivalId, status: m.status, at: m.at, wager: m.wager, stake: m.stake, payout: m.payout,
      terrain: g.terrain, map: g.map || 'plains', turn: g.turn, first: g.first, you: side(g.you, true), them: side(g.them, false),
      events: g.events, rival: rivalSummary(s, r),
    })
  }
  function activeGame(s, battleId) {
    const m = s.battles.find((b) => b.id === battleId)
    if (!m || m.status !== 'active' || !m.game) fail('not_active', 'That battle is over')
    m.game.events = []
    return m
  }
  function grantCard(s, p, cardId, serialNo, level = null) {
    const inv = p.inventory[cardId] || (p.inventory[cardId] = { count: 0, serials: [] })
    const isNew = !inv.everOwned
    const card = s.cards.find((c) => c.id === cardId)
    addCopy(inv, level ?? (card ? rollCardLevel(s, card) : 1))
    inv.everOwned = true
    if (serialNo != null) inv.serials.push(serialNo)
    if (isNew) addXp(s, s.xpRules.perNewCard)
    return isNew
  }
  function settle(s, m, r, forfeited = false) {
    const p = player(s)
    const rec = rivalRecord(s, r)
    const result = forfeited ? 'lost' : outcome(m.game)
    m.status = result
    m.endedAt = now()
    const w = m.wager
    const payout = { coins: 0, cards: [] }
    if (result === 'won') {
      if (w.type === 'coins' && w.amount > 0) { payout.coins = w.amount * 2; p.cash += payout.coins; p.stats.cashEarned += w.amount }
      if (w.type === 'card') {
        grantCard(s, p, w.cardId, w.serial, w.level)
        const isNew = grantCard(s, p, m.stake.cardId, null, m.stake.level)
        payout.cards = [{ cardId: w.cardId, returned: true }, { cardId: m.stake.cardId, isNew }]
      }
      addXp(s, w.type === 'card' || w.amount > 0 ? XP_BATTLE.win : XP_BATTLE.friendlyWin)
      p.battle.wins += 1; p.battle.streak += 1; p.battle.best = Math.max(p.battle.best, p.battle.streak)
      rec.losses += 1; rec.streak = 0
    } else if (result === 'draw') {
      if (w.type === 'coins') { p.cash += w.amount; payout.coins = w.amount }
      if (w.type === 'card') { grantCard(s, p, w.cardId, w.serial, w.level); payout.cards = [{ cardId: w.cardId, returned: true }] }
      p.battle.draws += 1
    } else {
      if (w.type === 'card') rec.taken.push(w.cardId)
      p.battle.losses += 1; p.battle.streak = 0
      rec.wins += 1; rec.streak += 1
    }
    m.payout = payout
    log(s, { type: 'battle', rivalId: r.id, rivalName: r.name, result, wager: w, payout, amount: result === 'won' ? payout.coins - (w.amount || 0) : result === 'lost' ? -(w.amount || 0) : 0 })
  }

  return {
    // ── reads ──
    snapshot: () => read((s) => {
      const p = player(s)
      const visible = s.cards.filter((c) => c.published || (p.inventory[c.id]?.count || 0) > 0)
      return {
        settings: s.settings, rarities: s.rarities, collections: s.collections,
        packs: s.packs.filter((pk) => pk.active).map((pk) => ({ ...pk, status: packStatus(s, pk, now()), odds: packOdds(s, pk) })),
        ranks: s.ranks, xpRules: s.xpRules, effects: EFFECTS,
        cards: visible, player: p,
        transactions: s.transactions.filter((t) => t.player === PLAYER).slice(-200).reverse(),
        dailyRewards: DAILY_REWARDS,
        activeBattleId: s.battles.find((b) => b.status === 'active' && b.player === PLAYER)?.id || null,
        cardStats: Object.fromEntries(visible.map((c) => [c.id, statsOfCard(s, c, bestLevel(p.inventory[c.id]))])),
        adminConfigured: !!s.admin.pinHash,
      }
    }),

    // ── player actions ──
    // Profile picture: one of the ready-made portraits, or the player's own
    // picture, already shrunk to a small square by the app. null resets to
    // the pixel face.
    setAvatar: (avatar) => serial((s) => {
      const p = player(s)
      if (avatar == null) { delete p.avatar; return { avatar: null } }
      if (avatar.kind === 'preset' && /^[a-z]{1,20}$/.test(String(avatar.id))) p.avatar = { kind: 'preset', id: String(avatar.id) }
      else if (avatar.kind === 'upload' && typeof avatar.data === 'string' && avatar.data.length <= 120000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar.data)) p.avatar = { kind: 'upload', data: avatar.data }
      else fail('invalid', 'That picture could not be used — try a smaller PNG or JPG')
      return { avatar: p.avatar }
    }),

    setPlayerName: (name) => serial((s) => {
      const n = String(name || '').trim().slice(0, 24)
      if (!n) fail('invalid', 'Name cannot be empty')
      player(s).name = n
      return { name: n }
    }),

    claimDaily: () => serial((s) => {
      const p = player(s)
      const d = today(now())
      if (p.lastDaily === d) fail('already', 'Already signed in today — come back tomorrow')
      p.lastDaily = d
      p.signin ||= { day: 0 }
      p.signin.day = (p.signin.day % DAILY_REWARDS.length) + 1
      const day = p.signin.day
      const reward = DAILY_REWARDS[day - 1]
      let coins = reward.coins || 0
      let opening = null, cosmetic = null
      if (reward.pack) {
        const pack = s.packs.find((x) => x.id === reward.pack)
        if (pack && packStatus(s, pack, now()).ok) opening = { ...rollPack(s, pack), packName: pack.name }
        else coins += pack?.priceCash || 500 // pack unavailable: its price in coins instead
      }
      if (reward.cosmetic) {
        const { kind, id } = reward.cosmetic
        const list = kind === 'frame' ? FRAMES : CARD_EFFECTS
        const item = list.find((x) => x.id === id)
        const owned = kind === 'frame' ? p.cosmetics.frames : p.cosmetics.effects
        if (item && !owned.includes(id)) { owned.push(id); cosmetic = { kind, id, name: item.name } }
        else coins += item?.price || 0
      }
      p.cash += coins
      p.stats.cashEarned += coins
      log(s, { type: 'daily', day, amount: coins, packName: opening?.packName, itemName: cosmetic?.name })
      return { day, coins, opening, cosmetic, cash: p.cash }
    }),

    buyPackWithCash: (packId) => serial((s) => {
      const pack = s.packs.find((p) => p.id === packId)
      if (!pack) fail('not_found', 'That pack does not exist')
      if (pack.priceCash == null) fail('invalid', 'This pack cannot be bought with ' + s.settings.currencyName)
      const status = packStatus(s, pack, now())
      if (!status.ok) fail('unavailable', status.reason)
      const p = player(s)
      if (p.cash < pack.priceCash) fail('funds', `Not enough ${s.settings.currencyName}`)
      p.cash -= pack.priceCash
      p.stats.cashSpent += pack.priceCash
      log(s, { type: 'pack_purchase', method: 'cash', packId, packName: pack.name, amount: -pack.priceCash })
      const opening = rollPack(s, pack)
      return { opening, cash: p.cash }
    }),

    // Quote → confirm, so the confirmation screen shows exactly what will be paid.
    quoteSale: (cardId, qty) => read((s) => {
      const card = s.cards.find((c) => c.id === cardId)
      if (!card) fail('not_found', 'Unknown card')
      const owned = player(s).inventory[cardId]?.count || 0
      return { cardId, qty, owned, unit: cardValue(s, card), total: cardValue(s, card) * qty }
    }),

    sellCard: (cardId, qty, expectedUnit) => serial((s) => {
      if (!isInt(qty) || qty < 1) fail('invalid', 'Quantity must be a whole number of at least 1')
      const card = s.cards.find((c) => c.id === cardId)
      if (!card) fail('not_found', 'Unknown card')
      const p = player(s)
      const inv = p.inventory[cardId]
      if (!inv || inv.count < qty) fail('not_owned', `You only own ${inv?.count || 0} of this card`)
      const unit = cardValue(s, card)
      // If the admin changed the price between the quote and the tap, stop and re-quote.
      if (expectedUnit != null && expectedUnit !== unit) fail('price_changed', 'The selling value just changed — please review the new price')
      for (let k = 0; k < qty; k++) takeLowest(inv)
      const burned = inv.serials.splice(Math.max(0, inv.serials.length - qty), qty)
      const total = unit * qty
      p.cash += total
      p.stats.cardsSold += qty
      p.stats.cashEarned += total
      addXp(s, s.xpRules.perSale * qty)
      log(s, { type: 'sale', cardId, cardName: card.name, qty, unit, amount: total, serials: burned })
      return { sold: qty, total, cash: p.cash, remaining: inv.count }
    }),

    quoteDuplicates: () => read((s) => {
      const p = player(s)
      const lines = []
      for (const [cardId, inv] of Object.entries(p.inventory)) {
        if (inv.count > 1) {
          const card = s.cards.find((c) => c.id === cardId)
          if (!card) continue
          lines.push({ cardId, name: card.name, rarityId: card.rarityId, qty: inv.count - 1, unit: cardValue(s, card) })
        }
      }
      return { lines, total: lines.reduce((t, l) => t + l.qty * l.unit, 0), count: lines.reduce((t, l) => t + l.qty, 0) }
    }),

    // Sells every copy beyond the first. `expectedTotal` must match the quote.
    sellDuplicates: (expectedTotal, rarityFilter = null) => serial((s) => {
      const p = player(s)
      let total = 0, count = 0
      const lines = []
      for (const [cardId, inv] of Object.entries(p.inventory)) {
        if (inv.count <= 1) continue
        const card = s.cards.find((c) => c.id === cardId)
        if (!card) continue
        if (rarityFilter && !rarityFilter.includes(card.rarityId)) continue
        const qty = inv.count - 1
        const unit = cardValue(s, card)
        lines.push({ cardId, card, inv, qty, unit })
        total += qty * unit; count += qty
      }
      if (!count) fail('nothing', 'You have no duplicates to sell')
      if (expectedTotal != null && expectedTotal !== total) fail('price_changed', 'Your duplicates or their values changed — please review again')
      for (const l of lines) {
        for (let k = 0; k < l.qty; k++) takeLowest(l.inv)
        const burned = l.inv.serials.splice(Math.max(0, l.inv.serials.length - l.qty), l.qty)
        log(s, { type: 'sale', cardId: l.cardId, cardName: l.card.name, qty: l.qty, unit: l.unit, amount: l.qty * l.unit, serials: burned, bulk: true })
      }
      p.cash += total
      p.stats.cardsSold += count
      p.stats.cashEarned += total
      addXp(s, s.xpRules.perSale * count)
      return { sold: count, total, cash: p.cash }
    }),

    // ── real-money purchases (provider-agnostic) ──
    // 1. client asks the server for a checkout → server records a pending order
    // 2. the payment provider takes the payment on its own page
    // 3. the provider calls our webhook with a signed event
    // 4. the webhook verifies the signature and fulfils the order exactly once
    createOrder: (packId, { ageConfirmed } = {}) => serial((s) => {
      if (!s.settings.realMoneyEnabled) fail('disabled', 'Real-money purchases are turned off')
      if (!ageConfirmed) fail('age', `You must confirm you are ${s.settings.minAge} or older`)
      const pack = s.packs.find((p) => p.id === packId)
      if (!pack || pack.priceUsd == null) fail('invalid', 'This pack is not sold for real money')
      const status = packStatus(s, pack, now())
      if (!status.ok) fail('unavailable', status.reason)
      const order = { id: uid('ord_'), packId, packName: pack.name, amountUsd: pack.priceUsd, status: 'pending', provider: 'simulated', createdAt: now(), player: PLAYER, oddsShown: packOdds(s, pack) }
      s.orders.push(order)
      return { orderId: order.id, amountUsd: order.amountUsd, packName: pack.name }
    }),

    // Stand-in for the provider. In production this lives on the provider's
    // side and signs with a secret the browser never sees.
    _simulateProviderEvent: (orderId, outcome) => read(async (s) => {
      const body = JSON.stringify({ type: outcome === 'paid' ? 'payment.succeeded' : 'payment.failed', orderId, at: now() })
      return { body, signature: await hmac(s.paymentSecret, body) }
    }),

    handlePaymentWebhook: (body, signature) => serial(async (s) => {
      const expected = await hmac(s.paymentSecret, body)
      if (signature !== expected) fail('bad_signature', 'Payment event signature did not verify')
      const evt = JSON.parse(body)
      const order = s.orders.find((o) => o.id === evt.orderId)
      if (!order) fail('not_found', 'Unknown order')
      if (order.status === 'fulfilled') return { order, opening: order.opening, duplicate: true } // idempotent
      if (evt.type !== 'payment.succeeded') {
        order.status = 'failed'
        return { order, opening: null }
      }
      const pack = s.packs.find((p) => p.id === order.packId)
      order.status = 'paid'
      log(s, { type: 'pack_purchase', method: 'real_money_simulated', packId: pack.id, packName: pack.name, amountUsd: order.amountUsd, orderId: order.id })
      const opening = rollPack(s, pack)
      order.status = 'fulfilled'
      order.fulfilledAt = now()
      order.opening = opening
      return { order: { ...order }, opening }
    }),

    cancelOrder: (orderId) => serial((s) => {
      const order = s.orders.find((o) => o.id === orderId)
      if (order && order.status === 'pending') order.status = 'cancelled'
      return { ok: true }
    }),

    // ── arena ──
    rivals: () => read((s) => RIVALS.map((r) => rivalSummary(s, r))),

    rivalProfile: (rivalId) => read((s) => {
      const r = RIVALS.find((x) => x.id === rivalId)
      if (!r) fail('not_found', 'Unknown rival')
      return { ...rivalSummary(s, r), collection: rivalCards(s, r).sort((a, b) => b.value - a.value) }
    }),

    // What the rival puts up against a given wager, shown before you commit.
    battleQuote: (rivalId, wager) => read((s) => {
      const r = RIVALS.find((x) => x.id === rivalId)
      if (!r) fail('not_found', 'Unknown rival')
      return { stake: rivalStake(s, r, checkWager(s, r, wager, null)) }
    }),

    startBattle: ({ rivalId, deck, starters, bench, wager, map }) => serial((s) => {
      const p = player(s)
      if (s.battles.some((b) => b.status === 'active')) fail('busy', 'Finish or forfeit your current battle first')
      const r = RIVALS.find((x) => x.id === rivalId)
      if (!r) fail('not_found', 'Unknown rival')
      const w = checkWager(s, r, wager, [...(starters || []), ...(bench || []), ...(deck || [])])
      if (map != null && !MAPS.some((x) => x.id === map)) fail('invalid', 'Unknown map')
      const mine = checkLineup(s, p, { starters, bench, deck }, w)
      const stake = rivalStake(s, r, w)
      // escrow: the stake leaves your balance or inventory now
      if (w.type === 'coins' && w.amount > 0) p.cash -= w.amount
      let escrowSerial = null, escrowLevel = null
      if (w.type === 'card') {
        const inv = p.inventory[w.cardId]
        escrowLevel = takeLowest(inv)
        escrowSerial = inv.serials.length ? inv.serials.pop() : null
      }
      const pool = rivalCards(s, r).sort((a, b) => b.power - a.power).slice(0, STARTERS + BENCH + 3)
      const picks = []
      const want = Math.min(STARTERS + BENCH, pool.length)
      while (picks.length < want) picks.push(pool.splice(randomInt(pool.length), 1)[0])
      // the rival starts its strongest three and benches the rest
      picks.sort((a, b) => b.power - a.power)
      const asCard = (c) => ({ ref: { kind: 'card', id: c.cardId }, stats: c.stats })
      const rc = (k) => ({ ref: { kind: 'recruit', id: RECRUITS[k % RECRUITS.length].id }, stats: RECRUITS[k % RECRUITS.length].stats })
      const theirs = { starters: picks.slice(0, STARTERS).map(asCard), bench: picks.slice(STARTERS).map(asCard) }
      for (let k = 0; theirs.starters.length < STARTERS; k++) theirs.starters.push(rc(k))
      for (let k = 0; theirs.bench.length < BENCH; k++) theirs.bench.push(rc(k + 1))
      const m = {
        id: uid('bt_'), rivalId, status: 'active', at: now(), player: PLAYER,
        wager: { ...w, serial: escrowSerial, level: escrowLevel }, stake,
        game: newMatch(mine, theirs, randomInt, { map: map || 'plains' }),
      }
      s.battles.push(m)
      if (s.battles.length > 60) s.battles.splice(0, s.battles.length - 60)
      log(s, { type: 'battle_start', rivalId, rivalName: r.name, wager: w })
      return battleView(s, m)
    }),

    activeBattle: () => read((s) => {
      const m = s.battles.find((b) => b.status === 'active' && b.player === PLAYER)
      return m ? battleView(s, m) : null
    }),

    // Lane battle actions. Your plays apply at once; End Turn runs your
    // attacks, then the rival's whole turn. Every step is recorded in
    // `events` for the table to animate.
    playCard: (battleId, handIdx, lane) => serial((s) => {
      const m = activeGame(s, battleId)
      try { lanePlay(m.game, 'you', handIdx, lane) } catch (e) { fail('invalid', e.message) }
      return battleView(s, m)
    }),

    useTactic: (battleId, kind, lane, toLane) => serial((s) => {
      const m = activeGame(s, battleId)
      try { laneTactic(m.game, 'you', kind, lane, toLane) } catch (e) { fail('invalid', e.message) }
      return battleView(s, m)
    }),

    endTurn: (battleId) => serial((s) => {
      const m = activeGame(s, battleId)
      const r = RIVALS.find((x) => x.id === m.rivalId)
      try {
        laneEnd(m.game, 'you')
        if (!m.game.over) { rivalPlays(m.game, rivalSkill(r.level)); laneEnd(m.game, 'them') }
      } catch (e) { fail('invalid', e.message) }
      if (m.game.over) settle(s, m, r)
      return battleView(s, m)
    }),

    forfeit: (battleId) => serial((s) => {
      const m = s.battles.find((b) => b.id === battleId)
      if (!m || m.status !== 'active' || !m.game) fail('not_active', 'That battle is over')
      m.game.events = []
      m.game.you.leader = 0
      m.game.over = true
      m.game.turn = null
      settle(s, m, RIVALS.find((x) => x.id === m.rivalId), true)
      return battleView(s, m)
    }),

    // First-time tutorial: pays once per account.
    completeTutorial: () => serial((s) => {
      const p = player(s)
      if (p.tutorialDone) return { reward: 0, cash: p.cash }
      p.tutorialDone = true
      p.cash += TUTORIAL_REWARD
      p.stats.cashEarned += TUTORIAL_REWARD
      log(s, { type: 'tutorial', amount: TUTORIAL_REWARD })
      return { reward: TUTORIAL_REWARD, cash: p.cash }
    }),

    // ── forge & cosmetics ──
    buyCosmetic: (kind, id) => serial((s) => {
      const list = kind === 'frame' ? FRAMES : kind === 'effect' ? CARD_EFFECTS : null
      const item = list?.find((x) => x.id === id)
      if (!item) fail('not_found', 'Unknown item')
      const p = player(s)
      const owned = kind === 'frame' ? p.cosmetics.frames : p.cosmetics.effects
      if (owned.includes(id)) fail('owned', 'You already own this')
      if (p.cash < item.price) fail('funds', `Not enough ${s.settings.currencyName}`)
      p.cash -= item.price
      p.stats.cashSpent += item.price
      owned.push(id)
      log(s, { type: 'cosmetic', kind, itemId: id, itemName: item.name, amount: -item.price })
      return { cash: p.cash }
    }),

    saveCustom: (input) => serial((s) => {
      const p = player(s)
      const existing = input.id ? p.customs.find((c) => c.id === input.id) : null
      if (input.id && !existing) fail('not_found', 'That card no longer exists')
      if (!existing && p.customs.length >= FORGE.maxCards) fail('limit', `You can keep up to ${FORGE.maxCards} custom cards`)
      let fields
      try { fields = validateCustom(input, { owned: p.cosmetics, level: existing?.level || 1 }) } catch (e) { fail(e.code || 'invalid', e.message) }
      if (existing) { Object.assign(existing, fields, { updatedAt: now() }); return existing }
      const card = { id: uid('custom_'), level: 1, createdAt: now(), ...fields }
      p.customs.push(card)
      log(s, { type: 'forge', cardName: card.name })
      return card
    }),

    upgradeCustom: (id) => serial((s) => {
      const p = player(s)
      const c = p.customs.find((x) => x.id === id)
      if (!c) fail('not_found', 'That card no longer exists')
      if (c.level >= FORGE.maxLevel) fail('max', 'This card is already at max level')
      const cost = FORGE.upgradeCost(c.level)
      if (p.cash < cost) fail('funds', `Upgrading costs ${cost.toLocaleString()} ${s.settings.currencyName}`)
      p.cash -= cost
      p.stats.cashSpent += cost
      c.level += 1
      log(s, { type: 'upgrade', cardName: c.name, level: c.level, amount: -cost })
      return { level: c.level, budget: FORGE.budget(c.level), cash: p.cash }
    }),

    deleteCustom: (id) => serial((s) => {
      const p = player(s)
      if (s.battles.some((b) => b.status === 'active' && b.game && JSON.stringify(b.game.you).includes(id))) fail('busy', 'That card is in a battle right now')
      const c = p.customs.find((x) => x.id === id)
      p.customs = p.customs.filter((x) => x.id !== id)
      return { imageKey: c?.art?.kind === 'upload' ? c.art.imageKey : null }
    }),

    // ── admin ──
    adminSetup: (pin) => serial(async (s) => {
      if (s.admin.pinHash) fail('exists', 'An admin PIN is already set')
      if (String(pin).length < 6) fail('invalid', 'Use at least 6 characters')
      s.admin.salt = uid()
      s.admin.pinHash = await hashPin(pin, s.admin.salt)
      const token = uid('adm_'); adminSessions.add(token)
      return { token }
    }),
    adminLogin: (pin) => read(async (s) => {
      if (!s.admin.pinHash) fail('not_setup', 'No admin PIN set yet')
      if ((await hashPin(pin, s.admin.salt)) !== s.admin.pinHash) fail('forbidden', 'Wrong PIN')
      const token = uid('adm_'); adminSessions.add(token)
      return { token }
    }),
    adminLogout: (token) => { adminSessions.delete(token) },

    adminSnapshot: (token) => read((s) => {
      requireAdmin(token)
      return {
        settings: s.settings, rarities: s.rarities, collections: s.collections,
        packs: s.packs.map((pk) => ({ ...pk, status: packStatus(s, pk, now()), odds: packOdds(s, pk), ev: packExpectedValue(s, pk) })),
        ranks: s.ranks, xpRules: s.xpRules, effects: EFFECTS, cards: s.cards,
        nextCode: s.nextCode,
        nextCollectionNumber: s.cards.reduce((m, c) => Math.max(m, c.collectionNumber), 0) + 1,
        orders: s.orders.slice(-100).reverse(),
        ownership: Object.fromEntries(s.cards.map((c) => [c.id, Object.values(s.players).reduce((t, p) => t + (p.inventory[c.id]?.count || 0), 0)])),
      }
    }),

    upsertCard: (token, input) => serial((s) => {
      requireAdmin(token)
      const existing = input.id ? s.cards.find((c) => c.id === input.id) : null
      if (input.id && !existing) fail('not_found', 'Card no longer exists')
      const fields = validateCard(s, input, existing)
      if (existing) {
        Object.assign(existing, fields, { updatedAt: now() })
        return existing
      }
      const card = { id: uid('card_'), code: `ORV-${String(s.nextCode++).padStart(4, '0')}`, ...fields, createdAt: now(), updatedAt: now() }
      s.cards.push(card)
      return card
    }),

    setPublished: (token, cardIds, published) => serial((s) => {
      requireAdmin(token)
      let n = 0
      for (const c of s.cards) if (cardIds.includes(c.id)) { c.published = !!published; c.updatedAt = now(); n++ }
      return { updated: n }
    }),

    deleteCard: (token, cardId) => serial((s) => {
      requireAdmin(token)
      if (ownedByAnyone(s, cardId)) fail('owned', 'Players own copies of this card. Unpublish it instead so nobody loses a card they hold.')
      const card = s.cards.find((c) => c.id === cardId)
      s.cards = s.cards.filter((c) => c.id !== cardId)
      return { imageKey: card?.imageKey || null }
    }),

    removeSampleCards: (token) => serial((s) => {
      requireAdmin(token)
      const ids = new Set(s.cards.filter((c) => c.sample).map((c) => c.id))
      s.cards = s.cards.filter((c) => !ids.has(c.id))
      for (const p of Object.values(s.players)) for (const id of ids) delete p.inventory[id]
      return { removed: ids.size }
    }),

    saveRarities: (token, rarities) => serial((s) => {
      requireAdmin(token)
      if (!Array.isArray(rarities) || rarities.length < 1) fail('invalid', 'Keep at least one rarity')
      const names = new Set()
      const out = rarities.map((r) => {
        const name = String(r.name || '').trim()
        if (!name) fail('invalid', 'Every rarity needs a name')
        if (names.has(name.toLowerCase())) fail('invalid', `Two rarities are named "${name}"`)
        names.add(name.toLowerCase())
        const weight = Number(r.weight), sellValue = Number(r.sellValue), xp = Number(r.xp)
        const minValue = Number(r.minValue ?? sellValue), maxValue = Number(r.maxValue ?? sellValue)
        if (!(weight >= 0)) fail('invalid', `${name}: drop weight must be 0 or more`)
        if (!isInt(sellValue) || sellValue < 0) fail('invalid', `${name}: selling value must be a whole number`)
        if (!isInt(minValue) || !isInt(maxValue) || minValue < 0 || maxValue < minValue) fail('invalid', `${name}: the value range must be whole numbers, lowest first`)
        if (sellValue < minValue || sellValue > maxValue) fail('invalid', `${name}: the default value must sit inside its range (${minValue}–${maxValue})`)
        if (!isInt(xp) || xp < 0) fail('invalid', `${name}: XP must be a whole number`)
        if (!EFFECTS.some((e) => e.id === r.effect)) fail('invalid', `${name}: unknown effect`)
        return { id: r.id || uid('r_'), name, weight, sellValue, minValue, maxValue, xp, color: r.color, color2: r.color2, effect: r.effect }
      })
      if (!out.some((r) => r.weight > 0)) fail('invalid', 'At least one rarity needs a drop weight above 0')
      const removed = s.rarities.filter((r) => !out.some((o) => o.id === r.id))
      for (const r of removed) if (s.cards.some((c) => c.rarityId === r.id)) fail('invalid', `Cards still use "${r.name}" — move them to another rarity before removing it`)
      s.rarities = out
      return out
    }),

    upsertPack: (token, input) => serial((s) => {
      requireAdmin(token)
      const name = String(input.name || '').trim()
      if (!name) fail('invalid', 'Packs need a name')
      const cardCount = Number(input.cardCount)
      if (!isInt(cardCount) || cardCount < 1 || cardCount > 20) fail('invalid', 'Cards per pack must be between 1 and 20')
      const priceCash = input.priceCash === '' || input.priceCash == null ? null : Number(input.priceCash)
      if (priceCash != null && (!isInt(priceCash) || priceCash < 0)) fail('invalid', 'In-game price must be a whole number')
      const priceUsd = input.priceUsd === '' || input.priceUsd == null ? null : Math.round(Number(input.priceUsd) * 100) / 100
      if (priceUsd != null && !(priceUsd > 0)) fail('invalid', 'Real-money price must be above 0')
      if (priceCash == null && priceUsd == null) fail('invalid', 'Give the pack at least one price')
      const pack = {
        id: input.id || uid('pk_'), name,
        tagline: String(input.tagline || '').slice(0, 120),
        description: String(input.description || '').slice(0, 1000),
        priceCash, priceUsd, cardCount,
        poolMode: input.poolMode === 'tagged' ? 'tagged' : 'all',
        rarityWeights: input.rarityWeights ? Object.fromEntries(Object.entries(input.rarityWeights).map(([k, v]) => [k, Math.max(0, Number(v) || 0)])) : null,
        guarantee: input.guarantee?.minRarityId ? { minRarityId: input.guarantee.minRarityId } : null,
        active: !!input.active, featured: !!input.featured, premium: !!input.premium,
        limited: {
          enabled: !!input.limited?.enabled,
          stock: Math.max(0, Number(input.limited?.stock) || 0),
          sold: s.packs.find((p) => p.id === input.id)?.limited?.sold || 0,
          endsAt: input.limited?.endsAt || null,
        },
        design: input.design || { c1: '#111', c2: '#888', c3: '#fff', emblem: 'wave' },
        sort: Number(input.sort) || 0,
      }
      const i = s.packs.findIndex((p) => p.id === pack.id)
      if (i >= 0) s.packs[i] = pack; else s.packs.push(pack)
      s.packs.sort((a, b) => a.sort - b.sort)
      return pack
    }),

    deletePack: (token, packId) => serial((s) => {
      requireAdmin(token)
      s.packs = s.packs.filter((p) => p.id !== packId)
      for (const c of s.cards) c.packIds = (c.packIds || []).filter((id) => id !== packId)
      return { ok: true }
    }),

    upsertCollection: (token, input) => serial((s) => {
      requireAdmin(token)
      const name = String(input.name || '').trim()
      if (!name) fail('invalid', 'Collections need a name')
      const col = { id: input.id || uid('col_'), name, description: String(input.description || '').slice(0, 500) }
      const i = s.collections.findIndex((c) => c.id === col.id)
      if (i >= 0) s.collections[i] = col; else s.collections.push(col)
      return col
    }),

    deleteCollection: (token, id) => serial((s) => {
      requireAdmin(token)
      s.collections = s.collections.filter((c) => c.id !== id)
      for (const c of s.cards) c.collectionIds = (c.collectionIds || []).filter((x) => x !== id)
      return { ok: true }
    }),

    saveRanks: (token, ranks, xpRules) => serial((s) => {
      requireAdmin(token)
      if (!ranks.length) fail('invalid', 'Keep at least one rank')
      const out = ranks.map((r, i) => {
        const label = String(r.label || '').trim()
        if (!label) fail('invalid', `Rank ${i + 1} needs a label`)
        const xp = i === 0 ? 0 : Number(r.xp)
        if (!isInt(xp) || xp < 0) fail('invalid', `${label}: XP must be a whole number`)
        if (i > 0 && xp <= Number(ranks[i - 1].xp || 0)) fail('invalid', `${label}: each rank must need more XP than the one before`)
        return { id: r.id || uid('rank_'), label, xp }
      })
      s.ranks = out
      if (xpRules) {
        for (const k of ['perPack', 'perNewCard', 'perSale']) {
          const v = Number(xpRules[k])
          if (!isInt(v) || v < 0) fail('invalid', 'XP rewards must be whole numbers')
          s.xpRules[k] = v
        }
      }
      return { ranks: out, xpRules: s.xpRules }
    }),

    saveSettings: (token, input) => serial((s) => {
      requireAdmin(token)
      const currencyName = String(input.currencyName || '').trim()
      if (!currencyName) fail('invalid', 'The currency needs a name')
      const n = (k) => { const v = Number(input[k]); if (!isInt(v) || v < 0) fail('invalid', `${k} must be a whole number`); return v }
      s.settings = { ...s.settings, currencyName, startingCash: n('startingCash'), dailyReward: n('dailyReward'), minAge: n('minAge'), realMoneyEnabled: !!input.realMoneyEnabled }
      return s.settings
    }),

    adminGrantCash: (token, amount) => serial((s) => {
      requireAdmin(token)
      const a = Number(amount)
      if (!isInt(a)) fail('invalid', 'Whole numbers only')
      const p = player(s)
      p.cash = Math.max(0, p.cash + a)
      log(s, { type: 'grant', amount: a, by: 'admin' })
      return { cash: p.cash }
    }),

    adminResetPlayer: (token) => serial((s) => {
      requireAdmin(token)
      s.players[PLAYER] = freshPlayer(s.settings, now())
      s.transactions = s.transactions.filter((t) => t.player !== PLAYER)
      return { ok: true }
    }),

    // Catalog export/import. Images are handled by the caller (they live in a
    // separate store); this moves the metadata.
    exportCatalog: (token) => read((s) => {
      requireAdmin(token)
      return { format: 'orvel-catalog', version: 1, exportedAt: now(), settings: s.settings, rarities: s.rarities, collections: s.collections, packs: s.packs, ranks: s.ranks, xpRules: s.xpRules, cards: s.cards, nextCode: s.nextCode }
    }),
    importCatalog: (token, data) => serial((s) => {
      requireAdmin(token)
      if (data?.format !== 'orvel-catalog') fail('invalid', 'That file is not an ORVEL catalog export')
      for (const k of ['settings', 'rarities', 'collections', 'packs', 'ranks', 'xpRules', 'cards']) if (data[k]) s[k] = data[k]
      s.nextCode = Math.max(s.nextCode, data.nextCode || 1)
      return { cards: s.cards.length }
    }),

    // Seeding is an internal bootstrap, not an admin action.
    _seedIfEmpty: (cards) => serial((s) => {
      if (s.cards.length || s.seeded) return { seeded: 0 }
      s.seeded = true
      for (const c of cards) s.cards.push({ id: uid('card_'), code: `ORV-${String(s.nextCode++).padStart(4, '0')}`, createdAt: now(), updatedAt: now(), sample: true, limited: { enabled: false, editionSize: 0, minted: 0 }, sellValue: null, fit: 'cover', published: true, ...c })
      return { seeded: cards.length }
    }),
  }
}
