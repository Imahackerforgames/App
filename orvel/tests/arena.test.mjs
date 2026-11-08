import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameServer } from '../src/server/game.js'
import { applyPlay, previewPlay, newSide, npcChoose, FORGE, MAX_HP, GUARD_CAP, RIVALS, rivalBetCap } from '../src/server/battle.js'
import { migrate, freshState } from '../src/server/game.js'
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

const card = (atk, def, element = 'ember', abilities = []) => ({ stats: { atk, def, element, abilities } })
const duel = (you, them) => ({ you: newSide(you), them: newSide(them), turn: 'you', top: null, log: [] })

test('strike vs guard: guard absorbs first and persists until broken', () => {
  const m = duel([card(6, 8, 'gale'), card(9, 1, 'gale')], [card(5, 5, 'gale'), card(5, 5, 'gale')])
  applyPlay(m, 'you', 0, 'guard')
  assert.equal(m.you.guard, 8)
  applyPlay(m, 'them', 0, 'strike') // 5 + match 2 = 7, all absorbed
  assert.equal(m.you.hp, MAX_HP)
  assert.equal(m.you.guard, 1)
  applyPlay(m, 'you', 1, 'strike') // 9 + match 2, them unguarded
  assert.equal(m.them.hp, MAX_HP - 11)
})

test('match +2, element advantage +3, rally, hex, burn, pierce, counter, cap', () => {
  let m = duel([card(5, 5, 'tide')], [card(4, 4, 'ember')])
  m.top = { element: 'ember' }
  assert.equal(previewPlay(m, 'you', 0, 'strike').atk, 8) // tide beats ember
  m.top = { element: 'tide' }
  assert.equal(previewPlay(m, 'you', 0, 'strike').atk, 7) // match
  m = duel([card(2, 2, 'gale', ['rally']), card(5, 5, 'tide')], [card(1, 1, 'gale'), card(1, 1, 'tide')])
  applyPlay(m, 'you', 0, 'guard'); applyPlay(m, 'them', 0, 'guard')
  assert.equal(previewPlay(m, 'you', 1, 'strike').atk, 5 + 3)
  m = duel([card(2, 2, 'gale', ['hex', 'burn'])], [card(6, 6, 'tide')])
  applyPlay(m, 'you', 0, 'guard')
  const e = applyPlay(m, 'them', 0, 'strike')
  assert.equal(e.burned, 3)
  assert.equal(e.atk, 6 - 3)
  m = duel([card(9, 1, 'gale', ['pierce'])], [card(1, 15, 'tide')])
  m.them.guard = 15
  assert.equal(previewPlay(m, 'you', 0, 'strike').dmg, 9)
  m = duel([card(1, 10, 'gale', ['counter'])], [card(8, 1, 'tide')])
  applyPlay(m, 'you', 0, 'guard')
  const c = applyPlay(m, 'them', 0, 'strike')
  assert.equal(c.reflect, 4)
  assert.equal(m.them.hp, MAX_HP - 4)
  m = duel([card(1, 30, 'gale')], [card(1, 1, 'tide')])
  applyPlay(m, 'you', 0, 'guard')
  assert.equal(m.you.guard, GUARD_CAP)
})

test('the rival plays after you, and you cannot play twice in a row', async () => {
  const { g } = await setup()
  const s0 = await g.snapshot()
  let b = await g.startBattle({ rivalId: RIVALS[2].id, deck: deckOf(s0) })
  assert.equal(b.turn, 'you')
  b = await g.playRound(b.id, 0, 'guard')
  assert.equal(b.log.length, 2)
  assert.equal(b.log[0].side, 'you'); assert.equal(b.log[1].side, 'them')
  assert.equal(b.turn, 'you')
  await assert.rejects(g.playRound(b.id, 1, 'dance'), /Strike or Guard/)
})

test('rivals find a lethal strike when there is one', () => {
  const m = duel([card(1, 1, 'gale'), card(1, 1, 'gale')], [card(3, 3, 'gale'), card(12, 1, 'gale')])
  m.you.hp = 10
  m.turn = 'them'
  const mv = npcChoose(m, 1)
  assert.deepEqual(mv, { i: 1, st: 'strike' })
})

test('30-day sign-in: rewards grow, packs and cosmetics arrive, then it loops', async () => {
  let t = Date.UTC(2026, 0, 1, 12)
  const g = createGameServer(memStorage(), { now: () => t })
  await g._seedIfEmpty(seedCards())
  const got = []
  for (let d = 1; d <= 31; d++) {
    const r = await g.claimDaily()
    got.push(r)
    await assert.rejects(g.claimDaily(), /Already/)
    t += 86400000
  }
  assert.equal(got[0].day, 1); assert.equal(got[29].day, 30); assert.equal(got[30].day, 1)
  assert.ok(got[1].coins > got[0].coins && got[28].coins > got[10].coins)
  assert.equal(got[6].opening.cards.length, 3)
  assert.equal(got[13].cosmetic.id, 'chrome')
  assert.equal(got[29].opening.cards.length, 5)
  const s = await g.snapshot()
  assert.ok(s.player.cosmetics.frames.includes('chrome'))
})

test('a duel left running under the old rules is refunded', () => {
  const s = freshState()
  s.version = 3
  s.players.local.cash = 100
  s.battles = [{ id: 'old', status: 'active', player: 'local', wager: { type: 'coins', amount: 250 }, you: {}, them: {}, log: [] }]
  migrate(s)
  assert.equal(s.players.local.cash, 350)
  assert.equal(s.battles[0].status, 'cancelled')
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
