import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGameServer } from '../src/server/game.js'
import { newMatch, playCard, useTactic, endTurn, rivalPlays, attackOf, unitOf, startTurn, FORGE, RIVALS, rivalBetCap, LEADER_HP, DECK_SIZE, TURN_LIMIT } from '../src/server/battle.js'
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
// plays whatever fits, then ends the turn, until the duel is over
async function playOut(g, b) {
  for (let guard = 0; guard < 60 && b.status === 'active'; guard++) {
    for (let i = 0; i < b.you.hand.length; i++) {
      const lane = b.you.board.findIndex((u) => !u)
      if (lane >= 0 && b.you.hand[i].unit.cost <= b.you.energy) { b = await g.playCard(b.id, i, lane); i = -1 }
    }
    b = await g.endTurn(b.id)
  }
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
  await assert.rejects(g.startBattle({ rivalId: RIVALS[0].id, deck: Array.from({ length: 9 }, (_, i) => deck[i % deck.length]) }), /up to/)
  const b = await g.startBattle({ rivalId: RIVALS[0].id, deck: deck.slice(0, 2) }) // Recruits fill the rest
  assert.equal(b.you.board.filter(Boolean).length + b.you.hand.length, 8)
})

test('a forfeit loses the bet; only one battle at a time', async () => {
  const { g } = await setup()
  const s0 = await g.snapshot()
  const b = await g.startBattle({ rivalId: RIVALS[1].id, deck: deckOf(s0), wager: { type: 'coins', amount: 100 } })
  await assert.rejects(g.startBattle({ rivalId: RIVALS[1].id, deck: deckOf(s0) }), /current battle/)
  const f = await g.forfeit(b.id)
  assert.equal(f.status, 'lost')
  assert.equal((await g.snapshot()).player.cash, s0.player.cash - 100)
  await assert.rejects(g.endTurn(b.id), /over/)
})

test('the rival hand and both decks stay hidden', async () => {
  const { g } = await setup()
  const s0 = await g.snapshot()
  const b = await g.startBattle({ rivalId: RIVALS[0].id, deck: deckOf(s0) })
  assert.equal(b.them.hand, undefined)
  assert.equal(typeof b.them.handCount, 'number')
  assert.equal(b.you.deck, undefined)
  assert.ok(b.events.every((e) => !(e.t === 'draw' && e.side === 'them' && e.card)))
})

const c = (atk, def, element = 'gale', abilities = []) => ({ ref: { kind: 'recruit', id: 'x' }, stats: { atk, def, element, abilities } })
const seq = (...xs) => { let i = 0; return (n) => (xs[i++] ?? 0) % n } // fixed "random" for shuffles and terrain
// a match where both decks are in order and every lane is Tide terrain
function match(you, them) {
  const m = newMatch(you, them, (n) => n - 1) // keeps decks in the order given
  m.terrain = ['tide', 'tide', 'tide']
  return m
}

test('units attack down their lane; an empty lane hits the leader', () => {
  const m = match([c(5, 5), c(5, 5), c(5, 5), c(5, 5)], [c(4, 4), c(4, 4), c(4, 4), c(4, 4)])
  assert.equal(m.you.hand.length, 4)
  assert.equal(m.you.energy, 2) // first turn
  playCard(m, 'you', 0, 0)
  endTurn(m, 'you') // the player who goes first doesn't attack on turn 1
  assert.equal(m.them.leader, LEADER_HP)
  playCard(m, 'them', 0, 0)
  endTurn(m, 'them')
  assert.equal(m.you.board[0].hp, unitOf(c(5, 5).stats).hp - 4)
  endTurn(m, 'you')
  assert.equal(m.them.board[0].hp, 7 - 5)
  playCard(m, 'them', 0, 1)
  endTurn(m, 'them')
  assert.equal(m.you.leader, LEADER_HP - 4) // their lane-1 unit faces an empty lane and hits the leader
  // (units attack the turn they're played, except on the very first turn)
})

test('energy grows by one a turn up to six, and costs are enforced', () => {
  const big = c(12, 12) // cost 5
  const m = match([big, big, big, big, big, big], [c(1, 1), c(1, 1), c(1, 1), c(1, 1)])
  assert.throws(() => playCard(m, 'you', 0, 0), /energy/)
  const seen = []
  for (let k = 0; k < 7; k++) { seen.push(m.you.maxEnergy); endTurn(m, 'you'); endTurn(m, 'them') }
  assert.deepEqual(seen, [2, 3, 4, 5, 6, 6, 6])
})

test('terrain +2, element +3, shield and fortify block, pierce carries through', () => {
  let m = match([c(5, 5, 'tide')], [c(1, 9, 'ember')])
  m.you.board[0] = { ...unitOf(c(5, 5, 'tide').stats), id: 'a', buff: 0, hex: 0, burn: 0 }
  m.them.board[0] = { ...unitOf(c(1, 9, 'ember').stats), id: 'b', buff: 0, hex: 0, burn: 0 }
  let a = attackOf(m, 'you', 0)
  assert.equal(a.atk, 5 + 2 + 3) // tide terrain, tide beats ember
  m.them.board[0].abilities = ['shield']; m.them.board[0].fortify = true
  a = attackOf(m, 'you', 0)
  assert.equal(a.dmg, 10 - 2 - 4)
  m = match([c(9, 1, 'gale', ['pierce'])], [c(1, 1, 'gale')])
  m.you.turns = 2
  m.you.board[0] = { ...unitOf(c(9, 1, 'gale', ['pierce']).stats), id: 'a', buff: 0, hex: 0, burn: 0 }
  m.them.board[0] = { ...unitOf(c(1, 1, 'gale').stats), id: 'b', buff: 0, hex: 0, burn: 0 } // 4 hp
  endTurn(m, 'you')
  assert.equal(m.them.board[0], null)
  assert.equal(m.them.leader, LEADER_HP - 5)
})

test('counter strikes back, drain heals, burn ticks, rally and hex apply on play', () => {
  const m = match([c(6, 2, 'gale', ['drain', 'burn']), c(2, 2, 'gale', ['rally']), c(2, 2, 'gale', ['hex'])], [c(4, 10, 'gale', ['counter']), c(1, 1, 'gale')])
  m.you.turns = 3; m.you.energy = 6; m.you.leader = 20
  playCard(m, 'you', 0, 0)
  m.them.board[0] = { ...unitOf(c(4, 10, 'gale', ['counter']).stats), id: 'b', buff: 0, hex: 0, burn: 0 }
  playCard(m, 'you', 0, 1) // rally: others +2 this turn
  assert.equal(m.you.board[0].buff, 2)
  playCard(m, 'you', 0, 0 + 2) // hex lane 2: no enemy there, no effect
  endTurn(m, 'you')
  const hit = m.you.board[0]
  assert.equal(m.you.leader, 20 + 4) // drain: half of 8 (6 ATK + 2 rally)
  assert.equal(hit.hp, 5 - 2) // counter: half of 4
  assert.equal(m.them.board[0].hp, 13 - 8 - 2) // 8 damage, then burn 2 as their turn starts
})

test('tactics: fortify and shift cost energy; shift once a turn', () => {
  const m = match([c(2, 2), c(2, 2), c(2, 2), c(2, 2)], [c(1, 1), c(1, 1), c(1, 1), c(1, 1)])
  playCard(m, 'you', 0, 0) // cost 1
  useTactic(m, 'you', 'shift', 0, 2) // cost 1
  assert.equal(m.you.board[2].atk, 2)
  assert.equal(m.you.energy, 0)
  assert.throws(() => useTactic(m, 'you', 'fortify', 2), /energy/)
  endTurn(m, 'you'); endTurn(m, 'them')
  useTactic(m, 'you', 'fortify', 2)
  assert.equal(m.you.board[2].fortify, true)
  m.you.energy = 3
  useTactic(m, 'you', 'shift', 2, 1)
  assert.throws(() => useTactic(m, 'you', 'shift', 1, 0), /already moved/)
})

test('rivals take a lethal line when one exists', () => {
  const m = match([c(1, 1), c(1, 1), c(1, 1), c(1, 1)], [c(9, 1, 'gale'), c(1, 1), c(1, 1), c(1, 1)])
  endTurn(m, 'you') // rival's turn starts
  m.them.turns = 3; m.them.energy = 6
  m.you.leader = 9
  rivalPlays(m, 1)
  endTurn(m, 'them')
  assert.ok(m.you.leader <= 0)
})

test('a duel always ends: turn limit decides on leader HP', () => {
  const m = match(Array(8).fill(c(1, 30)), Array(8).fill(c(1, 30)))
  for (let k = 0; k < 40 && !m.over; k++) { endTurn(m, m.turn) }
  assert.equal(m.over, true)
  assert.ok(m.you.turns >= TURN_LIMIT)
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
  // the custom card was listed first, so it starts on the field
  assert.equal(b.you.board[0].ref.kind, 'custom')
  assert.equal(b.you.board[0].atk, 6)
})

test('top rarities are rarer than before', async () => {
  const { g, token } = await setup()
  const a = await g.adminSnapshot(token)
  assert.equal(a.rarities.find((r) => r.id === 'r6').weight, 1)
  assert.equal(a.rarities.find((r) => r.id === 'r5').weight, 12)
})

test('the tutorial reward pays once per account', async () => {
  const { g } = await setup()
  const c0 = (await g.snapshot()).player.cash
  const a = await g.completeTutorial()
  assert.equal(a.reward, 300)
  const b = await g.completeTutorial()
  assert.equal(b.reward, 0)
  const s = await g.snapshot()
  assert.equal(s.player.cash, c0 + 300)
  assert.equal(s.player.tutorialDone, true)
})

test('every pulled copy gets a level inside its rarity band, at most 77', async () => {
  const { LEVEL_BANDS, MAX_LEVEL, rollLevel } = await import('../src/server/battle.js')
  const { g } = await setup()
  const snap = await g.snapshot()
  const tierOf = Object.fromEntries(snap.rarities.map((r, i) => [r.id, i]))
  for (const c of snap.cards) {
    const inv = snap.player.inventory[c.id]
    if (!inv?.count) continue
    assert.equal(inv.levels.length, inv.count)
    const [a, b] = LEVEL_BANDS[tierOf[c.rarityId]]
    for (const l of inv.levels) assert.ok(l >= a && l <= b && l <= MAX_LEVEL, `${l} outside ${a}-${b}`)
  }
  assert.equal(rollLevel(5, 0.99999), 77)
  assert.equal(rollLevel(0, 0), 1)
})

test('selling a duplicate gives up the lowest level and keeps the best', async () => {
  const { g } = await setup()
  const snap = await g.snapshot()
  const [id, inv] = Object.entries(snap.player.inventory).find(([, v]) => v.count >= 2) || []
  if (!id) return
  const best = Math.max(...inv.levels)
  const q = await g.quoteSale(id, 1)
  await g.sellCard(id, 1, q.unit)
  const after = (await g.snapshot()).player.inventory[id]
  assert.equal(Math.max(...after.levels), best)
  assert.equal(after.levels.length, inv.count - 1)
})

test('an old save gets a level for every copy it already owns', () => {
  const s = freshState()
  s.version = 5
  s.cards = [{ id: 'c1', rarityId: 'r6', name: 'X' }]
  s.players.local.inventory = { c1: { count: 3, serials: [] } }
  migrate(s)
  const inv = s.players.local.inventory.c1
  assert.equal(inv.levels.length, 3)
  for (const l of inv.levels) assert.ok(l >= 60 && l <= 77)
})

test('a save without levels gets them even when the catalog is already on v6', () => {
  const s = freshState()
  s.cards = [{ id: 'c1', rarityId: 'r1', name: 'X' }]
  s.players.local.inventory = { c1: { count: 2, serials: [] } }
  migrate(s)
  assert.equal(s.players.local.inventory.c1.levels.length, 2)
})

test('a duel starts with your three starters on the field and five on the bench', async () => {
  const { STARTERS, BENCH } = await import('../src/server/battle.js')
  const { g } = await setup()
  const snap = await g.snapshot()
  const owned = Object.entries(snap.player.inventory).filter(([, v]) => v.count > 0).map(([id]) => ({ kind: 'card', id }))
  const starters = owned.slice(0, 3), bench = owned.slice(3, 8)
  const b = await g.startBattle({ rivalId: RIVALS[0].id, starters, bench, wager: { type: 'coins', amount: 0 }, map: 'west' })
  assert.equal(b.map, 'west')
  assert.deepEqual(b.you.board.map((u) => u?.ref.id).slice(0, starters.length), starters.map((x) => x.id))
  assert.equal(b.you.board.length, 3)
  assert.equal(b.you.hand.length, BENCH)
  assert.equal(b.you.deckCount, 0)
  assert.ok(b.them.board.every(Boolean), 'the rival starts three too')
  assert.ok(b.terrain.filter((t) => t === 'ember').length >= 2, 'Dust Town leans Ember')
  assert.equal(STARTERS, 3)
})

test('swapping brings a bench card in for 1 energy and benches the fighter with its damage', () => {
  const m = newMatch({ starters: [c(3, 3), c(3, 3), c(3, 3)], bench: [c(2, 2), c(4, 4)] }, { starters: [], bench: [] }, seq(0, 0, 0, 0, 0))
  m.you.board[1].hp = 2
  const outId = m.you.board[1].id
  const before = m.you.energy
  useTactic(m, 'you', 'swap', 1, 0)
  assert.equal(m.you.energy, before - 1, 'a swap costs 1 energy')
  assert.notEqual(m.you.board[1].id, outId)
  const back = m.you.hand.find((h) => h.id === outId)
  assert.equal(back.unit.hp, 2, 'keeps its damage')
  assert.throws(() => useTactic(m, 'you', 'swap', 1, 0), /moved/)
})

test('an old client that sends one deck still gets a lineup', async () => {
  const { g } = await setup()
  const b = await g.startBattle({ rivalId: RIVALS[0].id, deck: deckOf(await g.snapshot()), wager: { type: 'coins', amount: 0 } })
  assert.ok(b.you.board.every(Boolean))
  assert.equal(b.you.hand.length, 5)
})

test('a knocked-out fighter is destroyed for the rest of the match', () => {
  const m = newMatch({ starters: [c(9, 9)], bench: [] }, { starters: [c(1, 1)], bench: [] }, seq(0, 0, 0, 0, 0))
  endTurn(m, 'you') // first turn: nobody attacks
  endTurn(m, 'them')
  endTurn(m, 'you')
  assert.equal(m.them.board[0], null)
  assert.equal(m.them.out.length, 1, 'it went to the destroyed pile')
  assert.equal(m.them.hand.length, 0, 'not back to the bench')
})

test('a duel left running on the five-lane field is cancelled and refunded', () => {
  const s = freshState()
  s.players.local.cash = 100
  s.battles = [{ id: 'b1', status: 'active', player: 'local', wager: { type: 'coins', amount: 50 }, game: { you: { board: [null, null, null, null, null] } } }]
  migrate(s)
  assert.equal(s.battles[0].status, 'cancelled')
  assert.equal(s.players.local.cash, 150)
})
