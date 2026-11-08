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
  DEFAULT_XP_RULES, DEFAULT_SETTINGS, EFFECTS,
} from './defaults.js'
import { randomInt, weightedPick, uid } from './rng.js'

const STATE_KEY = 'orvel:state:v1'
const MAX_TX = 5000
const PLAYER = 'local'

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
    inventory: {}, // cardId -> { count, serials: [] }
    stats: { packsOpened: 0, cardsPulled: 0, cardsSold: 0, cashEarned: 0, cashSpent: 0 },
    lastDaily: null, createdAt: now,
  }
}

export function freshState(now = Date.now()) {
  const settings = clone(DEFAULT_SETTINGS)
  return {
    version: 1,
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
  }
}

// ───────────────────────── pure helpers (also used by the UI) ─────────────

export function rarityIndex(state, rarityId) {
  return state.rarities.findIndex((r) => r.id === rarityId)
}

export function cardValue(state, card) {
  if (card.sellValue != null) return card.sellValue
  const r = state.rarities.find((x) => x.id === card.rarityId)
  return r ? r.sellValue : 0
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
export function createGameServer(storage, { now = () => Date.now() } = {}) {
  let state = null
  let queue = Promise.resolve()
  const adminSessions = new Set()

  // All calls run one at a time. Two rapid taps on "Buy" are two sequential
  // purchases checked against the balance each time, never two reads of the
  // same balance.
  function serial(fn) {
    const run = queue.then(async () => {
      if (!state) state = (await storage.get(STATE_KEY)) || freshState(now())
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
  const requireAdmin = (token) => { if (!token || !adminSessions.has(token)) fail('forbidden', 'Admin sign-in required') }

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
      inv.count += 1
      inv.everOwned = true
      if (serialNo) inv.serials.push(serialNo)

      const r = s.rarities[rarityIndex(s, rarityId)]
      addXp(s, r.xp || 0)
      if (isNew) addXp(s, s.xpRules.perNewCard)
      results.push({ cardId: card.id, rarityId, serial: serialNo, isNew })
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
        adminConfigured: !!s.admin.pinHash,
      }
    }),

    // ── player actions ──
    setPlayerName: (name) => serial((s) => {
      const n = String(name || '').trim().slice(0, 24)
      if (!n) fail('invalid', 'Name cannot be empty')
      player(s).name = n
      return { name: n }
    }),

    claimDaily: () => serial((s) => {
      const p = player(s)
      const d = today(now())
      if (p.lastDaily === d) fail('already', 'Daily reward already claimed — come back tomorrow')
      p.lastDaily = d
      p.cash += s.settings.dailyReward
      p.stats.cashEarned += s.settings.dailyReward
      log(s, { type: 'daily', amount: s.settings.dailyReward })
      return { amount: s.settings.dailyReward, cash: p.cash }
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
      inv.count -= qty
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
        l.inv.count -= l.qty
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
        packs: s.packs.map((pk) => ({ ...pk, status: packStatus(s, pk, now()), odds: packOdds(s, pk) })),
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
        if (!(weight >= 0)) fail('invalid', `${name}: drop weight must be 0 or more`)
        if (!isInt(sellValue) || sellValue < 0) fail('invalid', `${name}: selling value must be a whole number`)
        if (!isInt(xp) || xp < 0) fail('invalid', `${name}: XP must be a whole number`)
        if (!EFFECTS.some((e) => e.id === r.effect)) fail('invalid', `${name}: unknown effect`)
        return { id: r.id || uid('r_'), name, weight, sellValue, xp, color: r.color, color2: r.color2, effect: r.effect }
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
