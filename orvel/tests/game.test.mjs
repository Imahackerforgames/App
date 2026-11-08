import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameServer, packOdds, freshState, packExpectedValue, migrate } from '../src/server/game.js'
import { seedCards } from '../src/lib/seedArt.js'

function memStorage() {
  const m = new Map()
  return { get: async (k) => m.get(k), set: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))) } }
}

const art = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'
function sampleCards() {
  const out = []
  let n = 1
  for (const r of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) for (let i = 0; i < 4; i++) out.push({ name: `${r} card ${i}`, rarityId: r, collectionNumber: n++, imageUrl: art, packIds: ['pk-firstlight'] })
  return out
}

async function setup() {
  const g = createGameServer(memStorage())
  await g._seedIfEmpty(sampleCards())
  const { token } = await g.adminSetup('123456')
  return { g, token }
}

test('buying a pack charges exactly once and awards exactly cardCount cards', async () => {
  const { g } = await setup()
  const before = await g.snapshot()
  const { opening, cash } = await g.buyPackWithCash('pk-drift')
  assert.equal(opening.cards.length, 3)
  assert.equal(cash, before.player.cash - 250)
  const after = await g.snapshot()
  const total = Object.values(after.player.inventory).reduce((t, i) => t + i.count, 0)
  assert.equal(total, 3)
})

test('cannot buy with insufficient cash, and a failed buy changes nothing', async () => {
  const { g } = await setup()
  await assert.rejects(g.buyPackWithCash('pk-void'), /Not enough/)
  const s = await g.snapshot()
  assert.equal(s.player.cash, 1000)
  assert.equal(Object.keys(s.player.inventory).length, 0)
})

test('concurrent purchases cannot overspend', async () => {
  const { g } = await setup()
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => g.buyPackWithCash('pk-drift')))
  const ok = results.filter((r) => r.status === 'fulfilled').length
  assert.equal(ok, 4) // 1000 / 250
  assert.equal((await g.snapshot()).player.cash, 0)
})

test('cannot sell cards you do not own, or more copies than owned', async () => {
  const { g } = await setup()
  const s = await g.snapshot()
  const card = s.cards[0]
  await assert.rejects(g.sellCard(card.id, 1), /only own 0/)
  await g.buyPackWithCash('pk-drift')
  const s2 = await g.snapshot()
  const [id, inv] = Object.entries(s2.player.inventory)[0]
  await assert.rejects(g.sellCard(id, inv.count + 1), /only own/)
  await assert.rejects(g.sellCard(id, 0), /at least 1/)
  await assert.rejects(g.sellCard(id, 1.5), /whole number/)
  await assert.rejects(g.sellCard(id, -3), /at least 1/)
})

test('a sale pays the configured value and removes the copy', async () => {
  const { g } = await setup()
  await g.buyPackWithCash('pk-drift')
  const s = await g.snapshot()
  const [id, inv] = Object.entries(s.player.inventory)[0]
  const q = await g.quoteSale(id, 1)
  const r = await g.sellCard(id, 1, q.unit)
  assert.equal(r.cash, s.player.cash + q.unit)
  assert.equal(r.remaining, inv.count - 1)
  // selling again past zero fails
  if (r.remaining === 0) await assert.rejects(g.sellCard(id, 1), /only own 0/)
})

test('sale is refused when price changed since quote', async () => {
  const { g, token } = await setup()
  await g.buyPackWithCash('pk-drift')
  const s = await g.snapshot()
  const id = Object.keys(s.player.inventory)[0]
  const q = await g.quoteSale(id, 1)
  const card = s.cards.find((c) => c.id === id)
  await g.upsertCard(token, { ...card, sellValue: q.unit + 50 })
  await assert.rejects(g.sellCard(id, 1, q.unit), /changed/)
})

test('sell duplicates keeps one of each', async () => {
  const { g, token } = await setup()
  await g.adminGrantCash(token, 10000)
  for (let i = 0; i < 20; i++) await g.buyPackWithCash('pk-drift')
  const q = await g.quoteDuplicates()
  if (!q.count) return
  await g.sellDuplicates(q.total)
  const s = await g.snapshot()
  for (const inv of Object.values(s.player.inventory)) assert.ok(inv.count <= 1)
  await assert.rejects(g.sellDuplicates(0), /no duplicates/)
})

test('guaranteed slot respects the minimum rarity', async () => {
  const { g, token } = await setup()
  await g.adminGrantCash(token, 200000)
  for (let i = 0; i < 40; i++) {
    const { opening } = await g.buyPackWithCash('pk-void')
    const last = opening.cards[opening.cards.length - 1]
    assert.ok(['r4', 'r5', 'r6'].includes(last.rarityId), `got ${last.rarityId}`)
  }
})

test('observed rarity frequencies match disclosed odds', async () => {
  const { g, token } = await setup()
  await g.adminGrantCash(token, 10_000_000)
  const counts = {}
  const N = 3000
  for (let i = 0; i < N; i++) {
    const { opening } = await g.buyPackWithCash('pk-drift')
    for (const c of opening.cards) counts[c.rarityId] = (counts[c.rarityId] || 0) + 1
  }
  const s = await g.snapshot()
  const odds = s.packs.find((p) => p.id === 'pk-drift').odds.standard
  for (const o of odds.filter((x) => x.pct > 5)) {
    const observed = (counts[o.rarityId] / (N * 3)) * 100
    assert.ok(Math.abs(observed - o.pct) < 2.5, `${o.name}: expected ${o.pct.toFixed(1)}%, saw ${observed.toFixed(1)}%`)
  }
})

test('limited-edition cards stop dropping when the edition is minted out', async () => {
  const { g, token } = await setup()
  const a = await g.adminSnapshot(token)
  // make one Origin Zero card a 2-copy limited edition, remove the others from r6
  const r6 = a.cards.filter((c) => c.rarityId === 'r6')
  await g.upsertCard(token, { ...r6[0], limited: { enabled: true, editionSize: 2 } })
  for (const c of r6.slice(1)) await g.setPublished(token, [c.id], false)
  await g.upsertPack(token, { ...a.packs.find((p) => p.id === 'pk-drift'), rarityWeights: { r1: 0, r2: 0, r3: 0, r4: 0, r5: 0, r6: 1 }, priceCash: 1 })
  await g.adminGrantCash(token, 100)
  const { opening } = await g.buyPackWithCash('pk-drift') // 3 slots, only 2 copies exist
    .catch((e) => ({ opening: null, e }))
  // with only 2 copies the third slot cannot be filled: purchase must fail atomically
  assert.equal(opening, null)
  const s = await g.snapshot()
  assert.equal(Object.keys(s.player.inventory).length, 0)
})

test('payment webhook verifies signature and fulfils exactly once', async () => {
  const { g } = await setup()
  await assert.rejects(g.createOrder('pk-rift', {}), /confirm/)
  const { orderId } = await g.createOrder('pk-rift', { ageConfirmed: true })
  const evt = await g._simulateProviderEvent(orderId, 'paid')
  await assert.rejects(g.handlePaymentWebhook(evt.body, 'forged'), /signature/)
  const tampered = evt.body.replace('payment.succeeded', 'payment.succeeded ')
  await assert.rejects(g.handlePaymentWebhook(tampered, evt.signature), /signature/)
  const first = await g.handlePaymentWebhook(evt.body, evt.signature)
  assert.equal(first.opening.cards.length, 5)
  const again = await g.handlePaymentWebhook(evt.body, evt.signature)
  assert.equal(again.duplicate, true)
  const s = await g.snapshot()
  const total = Object.values(s.player.inventory).reduce((t, i) => t + i.count, 0)
  assert.equal(total, 5)
  assert.equal(s.player.cash, 1000) // real-money pack spent no cash
})

test('admin actions require a session', async () => {
  const { g } = await setup()
  await assert.rejects(g.adminGrantCash('nope', 1000), /Admin/)
  await assert.rejects(g.adminLogin('wrongpin'), /Wrong PIN/)
  const { token } = await g.adminLogin('123456')
  assert.ok(token)
})

test('daily reward once per day', async () => {
  let t = Date.UTC(2026, 0, 1, 10)
  const g = createGameServer(memStorage(), { now: () => t })
  await g.claimDaily()
  await assert.rejects(g.claimDaily(), /already/)
  t += 24 * 3600 * 1000
  await g.claimDaily()
})

test('odds disclosure ignores rarities with no cards', () => {
  const s = freshState()
  s.cards = [{ id: 'a', published: true, rarityId: 'r1' }, { id: 'b', published: true, rarityId: 'r2' }]
  const o = packOdds(s, s.packs[0])
  const sum = o.standard.reduce((t, x) => t + x.pct, 0)
  assert.ok(Math.abs(sum - 100) < 1e-9)
  assert.equal(o.standard.find((x) => x.rarityId === 'r6').pct, 0)
})

test('no default pack pays back more than it costs (no currency printer)', () => {
  const s = freshState()
  s.cards = seedCards().map((c, i) => ({ ...c, id: 'c' + i, published: true, limited: { enabled: false } }))
  for (const p of s.packs) {
    const ev = packExpectedValue(s, p)
    assert.ok(ev < p.priceCash * 0.8, `${p.name}: expected sell-back ${ev.toFixed(0)} vs price ${p.priceCash}`)
  }
})

test('sample card values sit inside their rarity ranges', () => {
  const s = freshState()
  for (const c of seedCards()) {
    const r = s.rarities.find((x) => x.id === c.rarityId)
    assert.ok(c.sellValue >= r.minValue && c.sellValue <= r.maxValue, `${c.name}: ${c.sellValue}`)
  }
  const top = seedCards().filter((c) => c.rarityId === 'r6')
  assert.ok(top.every((c) => c.sellValue >= 50000 && c.sellValue <= 100000))
})

test('a v1 save is moved to the new economy, but customised values are kept', () => {
  const s = freshState()
  s.version = 1
  Object.assign(s.rarities[0], { weight: 6200, sellValue: 5 }); delete s.rarities[0].minValue; delete s.rarities[0].maxValue
  Object.assign(s.rarities[1], { weight: 1234, sellValue: 99 }); delete s.rarities[1].minValue; delete s.rarities[1].maxValue
  s.packs[0].priceCash = 100
  s.packs[1].priceCash = 333
  s.cards = [{ id: 'x', name: 'Origin', rarityId: 'r6', sample: true, sellValue: null }]
  migrate(s)
  assert.equal(s.rarities[0].weight, 6800)
  assert.equal(s.rarities[1].sellValue, 99)
  assert.deepEqual([s.rarities[1].minValue, s.rarities[1].maxValue], [99, 99])
  assert.equal(s.packs[0].priceCash, 250)
  assert.equal(s.packs[1].priceCash, 333)
  assert.ok(s.cards[0].sellValue >= 50000)
  assert.equal(s.version, 3)
})

test('rarity value ranges are validated', async () => {
  const { g, token } = await setup()
  const a = await g.adminSnapshot(token)
  const bad = a.rarities.map((r, i) => (i === 3 ? { ...r, minValue: 750, maxValue: 250 } : r))
  await assert.rejects(g.saveRarities(token, bad), /range/)
  const outside = a.rarities.map((r, i) => (i === 3 ? { ...r, sellValue: 9000 } : r))
  await assert.rejects(g.saveRarities(token, outside), /inside its range/)
})
