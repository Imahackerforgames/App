import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameServer } from '../src/server/game.js'
import { resolveRound, npcChoose, FORGE, MAX_HP, RIVALS, rivalBetCap } from '../src/server/battle.js'
import { seedCards } from '../src/lib/seedArt.js'

function memStorage() {
  const m = new Map()
  return { get: async (k) => m.get(k), set: async (k, v) => { m.set(k, JSON.parse(JSON.stringify(v))) } }
}
async function setup(cash = 50000) {
  const g = createGameServer(memStorage())
  await g._seedIfEmpty(seedCards())
  const { token } = await g.adminSetup('123456')
  await g.adminGrantCash(token, cash)
  for (let i = 0; i < 12; i++) await g.buyPackWithCash('pk-drift')
  return { g, token }
}
const deckOf = (snap) => Object.entries(snap.player.inventory).filter(([, v]) => v.count > 0).slice(0, 5).map(([id]) => ({ kind: 'card', id }))
async function playOut(g, b) {
  while (b.status === 'active') b = await g.playRound(b.id, b.you.hand.findIndex((h) => !h.used))
  return b
}

test('coin bets are held at the start and pay double on a win', async () => {
  const { g } = await setup()
  const s0 = await g.snapshot()
  const rival = RIVALS[0]
  let b = await g.startBattle({ rivalId: rival.id, deck: deckOf(s0), wager: { type: 'coins', amount: 200 } })
  assert.equal((await g.snapshot()).player.cash, s0.player.cash - 200)
  b = await playOut(g, b)
  const cash = (await g.snapshot()).player.cash
  if (b.status === 'won') assert.equal(cash, s0.player.cash + 200)
  if (b.status === 'lost') assert.equal(cash, s0.player.cash - 200)
  if (b.status === 'draw') assert.equal(cash, s0.player.cash)
})

test('card bets: win keeps yours and adds theirs; lose hands yours to the rival', async () => {
  const { g } = await setup()
  const s0 = await g.snapshot()
  const deck = deckOf(s0)
  const spare = Object.entries(s0.player.inventory).find(([id, v]) => v.count > 0 && !deck.some((d) => d.id === id))
  assert.ok(spare, 'need a spare card')
  const [cardId] = spare
  const before = s0.player.inventory[cardId].count
  let b = await g.startBattle({ rivalId: RIVALS[0].id, deck, wager: { type: 'card', cardId } })
  assert.equal((await g.snapshot()).player.inventory[cardId].count, before - 1)
  b = await playOut(g, b)
  const s1 = await g.snapshot()
  if (b.status === 'won') {
    assert.equal(s1.player.inventory[cardId].count - (b.stake.cardId === cardId ? 1 : 0), before)
    assert.ok(s1.player.inventory[b.stake.cardId].count >= 1)
  } else if (b.status === 'lost') {
    assert.equal(s1.player.inventory[cardId].count, before - 1)
    const prof = await g.rivalProfile(RIVALS[0].id)
    assert.ok(prof.collection.some((c) => c.cardId === cardId))
  } else assert.equal(s1.player.inventory[cardId].count, before)
})

test('bets are capped by rival level and by your balance', async () => {
  const { g, token } = await setup()
  const s0 = await g.snapshot()
  const r = RIVALS[0]
  await assert.rejects(g.startBattle({ rivalId: r.id, deck: deckOf(s0), wager: { type: 'coins', amount: rivalBetCap(r.level) + 1 } }), /at most/)
  await g.adminGrantCash(token, -s0.player.cash + 50)
  await assert.rejects(g.startBattle({ rivalId: RIVALS[11].id, deck: deckOf(s0), wager: { type: 'coins', amount: 51 } }), /Not enough/)
  await assert.rejects(g.startBattle({ rivalId: r.id, deck: deckOf(s0), wager: { type: 'coins', amount: -5 } }), /whole/)
})

test('cannot bet or play cards you do not own, and decks must be 5 distinct cards', async () => {
  const { g } = await setup()
  const s0 = await g.snapshot()
  const unowned = s0.cards.find((c) => !s0.player.inventory[c.id]?.count)
  const deck = deckOf(s0)
  await assert.rejects(g.startBattle({ rivalId: RIVALS[0].id, deck, wager: { type: 'card', cardId: unowned.id } }), /own/)
  await assert.rejects(g.startBattle({ rivalId: RIVALS[0].id, deck: [...deck.slice(0, 4), { kind: 'card', id: unowned.id }] }), /own/)
  await assert.rejects(g.startBattle({ rivalId: RIVALS[0].id, deck: [...deck.slice(0, 4), deck[0]] }), /once/)
  await assert.rejects(g.startBattle({ rivalId: RIVALS[0].id, deck: deck.slice(0, 3) }), /exactly/)
})

test('a forfeit loses the bet; only one battle at a time', async () => {
  const { g } = await setup()
  const s0 = await g.snapshot()
  const b = await g.startBattle({ rivalId: RIVALS[1].id, deck: deckOf(s0), wager: { type: 'coins', amount: 100 } })
  await assert.rejects(g.startBattle({ rivalId: RIVALS[1].id, deck: deckOf(s0) }), /current battle/)
  const f = await g.forfeit(b.id)
  assert.equal(f.status, 'lost')
  assert.equal((await g.snapshot()).player.cash, s0.player.cash - 100)
  await assert.rejects(g.playRound(b.id, 0), /over/)
})

test('a card cannot be played twice in one battle', async () => {
  const { g } = await setup()
  const s0 = await g.snapshot()
  const b = await g.startBattle({ rivalId: RIVALS[0].id, deck: deckOf(s0) })
  await g.playRound(b.id, 0)
  await assert.rejects(g.playRound(b.id, 0), /not played/)
})

test('the rival choice never depends on which card the player picked', () => {
  const mk = (atk, def, element = 'ember', abilities = []) => ({ stats: { atk, def, element, abilities }, used: false })
  const n = [mk(5, 5), mk(9, 2, 'tide'), mk(3, 9, 'gale'), mk(6, 6), mk(7, 3)]
  const p = [mk(4, 4), mk(8, 8), mk(2, 9), mk(10, 1), mk(5, 5)]
  const side = { hp: MAX_HP, rally: 0, burn: 0 }
  // npcChoose has no parameter for the player's current pick at all
  assert.equal(npcChoose.length, 5)
  const picks = new Set(Array.from({ length: 30 }, () => npcChoose(n, p, side, side, 1)))
  assert.equal(picks.size, 1) // full skill is deterministic given the visible hands
})

test('round resolution: element bonus, pierce, shield, drain, burn', () => {
  const side = { hp: 30, rally: 0, burn: 0 }
  const r1 = resolveRound({ atk: 6, def: 4, element: 'ember', abilities: [] }, { atk: 6, def: 4, element: 'gale', abilities: [] }, side, side)
  assert.ok(r1.N.hp < r1.P.hp) // ember beats gale
  const r2 = resolveRound({ atk: 5, def: 1, element: 'gale', abilities: ['pierce'] }, { atk: 1, def: 20, element: 'gale', abilities: [] }, side, side)
  assert.equal(r2.entry.toN, 5)
  const r3 = resolveRound({ atk: 10, def: 1, element: 'gale', abilities: [] }, { atk: 1, def: 1, element: 'gale', abilities: ['shield'] }, side, side)
  assert.equal(r3.entry.toN, 7)
  const r4 = resolveRound({ atk: 10, def: 1, element: 'gale', abilities: ['burn', 'drain'] }, { atk: 1, def: 1, element: 'gale', abilities: [] }, { ...side, hp: 20 }, side)
  assert.equal(r4.N.burn, 2)
  assert.equal(r4.P.hp, 20 - 1 + 5)
})

test('forge: stat budget, owned cosmetics, upgrades cost coins', async () => {
  const { g } = await setup()
  const base = { name: 'Lantern Knight', element: 'tide', abilities: ['shield'], frame: 'basic', effect: 'matte', art: { kind: 'scene', scene: 'sea', palette: 'nocturne', seed: 'x' } }
  await assert.rejects(g.saveCustom({ ...base, atk: 8, def: 8 }), /stat points/)
  await assert.rejects(g.saveCustom({ ...base, atk: 5, def: 5, frame: 'prism' }), /frame/)
  await assert.rejects(g.saveCustom({ ...base, atk: 5, def: 5, abilities: ['shield', 'drain'] }), /second ability/)
  const c = await g.saveCustom({ ...base, atk: 5, def: 5 })
  const cash0 = (await g.snapshot()).player.cash
  const up = await g.upgradeCustom(c.id)
  assert.equal(up.level, 2)
  assert.equal((await g.snapshot()).player.cash, cash0 - FORGE.upgradeCost(1))
  await g.saveCustom({ ...base, id: c.id, atk: 6, def: 6 }) // level 2 budget = 12
  await g.buyCosmetic('frame', 'chrome')
  await assert.rejects(g.buyCosmetic('frame', 'chrome'), /already own/)
  await g.saveCustom({ ...base, id: c.id, atk: 6, def: 6, frame: 'chrome' })
  const s = await g.snapshot()
  assert.equal(s.player.customs[0].frame, 'chrome')
  // custom cards play in battle but can never be sold or bet
  await assert.rejects(g.sellCard(c.id, 1), /Unknown card/)
  await assert.rejects(g.startBattle({ rivalId: RIVALS[0].id, deck: deckOf(s), wager: { type: 'card', cardId: c.id } }), /own/)
  const deck = [{ kind: 'custom', id: c.id }, ...deckOf(s).slice(0, 4)]
  const b = await g.startBattle({ rivalId: RIVALS[0].id, deck })
  assert.equal(b.you.hand[0].stats.atk, 6)
})

test('top rarities are rarer than before', async () => {
  const { g, token } = await setup()
  const a = await g.adminSnapshot(token)
  assert.equal(a.rarities.find((r) => r.id === 'r6').weight, 1)
  assert.equal(a.rarities.find((r) => r.id === 'r5').weight, 12)
})
