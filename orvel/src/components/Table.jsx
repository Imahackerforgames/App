import { useEffect, useMemo, useRef, useState } from 'react'
import CardFrame from './Card.jsx'
import Avatar from './Avatar.jsx'
import { Btn } from './ui.jsx'
import { useGame, fmt } from '../store.jsx'
import { useResolve, Result, tierColor, leagueOf, Crest, Abilities, StatTiles } from '../pages/Arena.jsx'
import { ELEMENTS, LANES, LEADER_HP, MAX_ENERGY, TURN_LIMIT, TACTIC_COST, attackOf, canPlay } from '../server/battle.js'
import { play } from '../lib/sound.js'

// The duel, played on a 3D table. The server decides everything; this
// component sends taps ("play card 2 in lane 0", "end turn") and animates the
// events that come back, one by one.

const EL = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const DUR = { turn: 1000, draw: 200, play: 520, attack: 720, die: 520, burn: 520, rally: 420, hex: 420, fortify: 420, shift: 480, nobattle: 600, timeup: 900 }
const LANE_NAMES = ['LEFT', 'MIDDLE', 'RIGHT']

export default function Table({ initial, onClose, onRematch }) {
  const { call, snap } = useGame()
  const resolve = useResolve()
  const [b, setB] = useState(initial)
  const [disp, setDisp] = useState(() => ({ you: initial.you, them: initial.them }))
  const [busy, setBusy] = useState(false)
  const [fx, setFx] = useState(null)
  const [pops, setPops] = useState([])
  const [sel, setSel] = useState(null) // hand index
  const [menu, setMenu] = useState(null) // { side, lane }
  const [shiftFrom, setShiftFrom] = useState(null)
  const [banner, setBanner] = useState('start')
  const [feed, setFeed] = useState([])
  const [showResult, setShowResult] = useState(initial.status !== 'active')
  const alive = useRef(true)
  const dispRef = useRef(disp)
  dispRef.current = disp
  useEffect(() => () => { alive.current = false }, [])
  useEffect(() => { const p = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = p } }, [])
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(null), 1400); return () => clearTimeout(t) }, [banner])

  const r = b.rival
  const league = leagueOf(r.level).id
  const myTurn = !busy && b.status === 'active' && b.turn === 'you'
  const name = (side) => (side === 'you' ? 'You' : r.name)
  const unitName = (u) => (u ? resolve(u.ref)?.card.name || 'Unit' : 'Unit')

  function pop(side, lane, text, kind) {
    const id = Math.random()
    setPops((p) => [...p, { id, side, lane, text, kind }])
    setTimeout(() => alive.current && setPops((p) => p.filter((x) => x.id !== id)), 1300)
  }
  const say = (line) => setFeed((f) => [line, ...f].slice(0, 6))

  async function animate(events, final) {
    for (const e of events) {
      if (!alive.current) return
      setFx(e)
      const before = e.snap
      if (e.t === 'turn') { setBanner(e.side === 'you' ? 'you' : 'them'); play(e.side === 'you' ? 'turn' : 'click') }
      if (e.t === 'play') { play('flip'); say(`${name(e.side)} played ${resolve(e.card.ref)?.card.name} in the ${LANE_NAMES[e.lane].toLowerCase()} lane`) }
      if (e.t === 'attack') {
        const target = e.side === 'you' ? 'them' : 'you'
        play('hit', e.dmg >= 8)
        if (e.target === 'leader') { pop(target, 'leader', `−${e.dmg}`, 'dmg'); say(`${e.side === 'you' ? 'You hit' : `${r.name} hit`} ${e.side === 'you' ? `${r.name}'s leader` : 'your leader'} for ${e.dmg}`) }
        else {
          pop(target, e.lane, e.dmg ? `−${e.dmg}` : 'BLOCKED', e.dmg ? 'dmg' : 'block')
          if (e.blocked) pop(target, e.lane, `⛨ ${e.blocked}`, 'block')
          if (e.back) pop(e.side, e.lane, `−${e.back}`, 'dmg')
          if (e.through) pop(target, 'leader', `−${e.through}`, 'dmg')
          say(`${e.side === 'you' ? 'Your' : `${r.name}'s`} ${LANE_NAMES[e.lane].toLowerCase()} unit hit for ${e.dmg}${e.through ? ` (+${e.through} through)` : ''}${e.back ? `, took ${e.back} back` : ''}`)
        }
        if (e.heal) pop(e.side, 'leader', `+${e.heal}`, 'heal')
      }
      if (e.t === 'die') { play('back'); say(`${e.side === 'you' ? 'Your' : `${r.name}'s`} unit in the ${LANE_NAMES[e.lane].toLowerCase()} lane fell`) }
      if (e.t === 'burn') { pop(e.side, e.lane, `🔥−${e.dmg}`, 'burn'); play('hit') }
      if (e.t === 'fortify') { pop(e.side, e.lane, '⛨ FORTIFIED', 'guard'); play('guard') }
      if (e.t === 'rally') { pop(e.side, e.lane, 'RALLY +2', 'heal'); play('coin') }
      if (e.t === 'hex') { pop(e.side === 'you' ? 'them' : 'you', e.lane, 'HEX −3', 'hex'); play('error') }
      if (e.t === 'shift') play('swipe')
      if (e.t === 'nobattle') say(`${name(e.side)} can't attack on the first turn`)
      if (e.t === 'die') {
        // keep the fallen unit on the table while it topples, then clear it
        setFx({ ...e, ghost: dispRef.current[e.side].board[e.lane] })
        await sleep(DUR.die)
        setDisp({ you: before.you, them: before.them })
        continue
      }
      setDisp({ you: before.you, them: before.them })
      await sleep(DUR[e.t] ?? 400)
    }
    setFx(null)
    setDisp({ you: final.you, them: final.them })
    if (final.status !== 'active') { await sleep(600); setShowResult(true); play(final.status === 'won' ? 'cash' : 'back') }
  }

  async function act(fn) {
    if (busy) return
    setBusy(true); setMenu(null); setSel(null); setShiftFrom(null)
    try {
      const nb = await call(fn)
      setB(nb)
      await animate(nb.events || [], nb)
    } catch { /* toast shown */ } finally { if (alive.current) setBusy(false) }
  }
  const playTo = (lane) => act((s) => s.playCard(b.id, sel, lane))
  const endTurn = () => { play('click'); act((s) => s.endTurn(b.id)) }
  const forfeit = () => act((s) => s.forfeit(b.id))

  // A game-shaped object for the shared rule helpers (attack previews etc.)
  const view = useMemo(() => ({ terrain: b.terrain, turn: b.turn, over: b.status !== 'active', you: { ...b.you, ...disp.you }, them: { ...b.them, ...disp.them, hand: [] } }), [b, disp])

  function tapSlot(side, lane) {
    const u = disp[side].board[lane]
    if (side === 'you' && sel != null && !u && myTurn) { if (!canPlay(view, 'you', sel, lane)) return playTo(lane) }
    if (side === 'you' && shiftFrom != null && !u && myTurn) return act((s) => s.useTactic(b.id, 'shift', shiftFrom, lane))
    if (u) { play('click'); setSel(null); setShiftFrom(null); setMenu({ side, lane }) }
  }

  const energy = disp.you.energy ?? b.you.energy
  const selCard = sel != null ? b.you.hand[sel] : null

  const Slot = ({ side, lane }) => {
    const dyingHere = fx?.t === 'die' && fx.side === side && fx.lane === lane && fx.ghost
    const u = dyingHere ? fx.ghost : disp[side].board[lane]
    const d = u && resolve(u.ref)
    const canDrop = side === 'you' && myTurn && !u && ((selCard && !canPlay(view, 'you', sel, lane)) || shiftFrom != null)
    const attacking = fx?.t === 'attack' && fx.side === side && fx.lane === lane
    const hitHere = fx?.t === 'attack' && fx.side !== side && fx.lane === lane && fx.target === 'unit'
    const dropping = fx?.t === 'play' && fx.side === side && fx.lane === lane
    const dying = !!dyingHere
    const nextAtk = u && b.status === 'active' ? attackOf(view, side, lane) : null
    return (
      <div className={`slot slot-${side} ${canDrop ? 'drop' : ''} ${menu?.side === side && menu?.lane === lane ? 'focus' : ''}`} onClick={() => tapSlot(side, lane)}
        role="button" tabIndex={0} aria-label={u ? `${side === 'you' ? 'Your' : 'Enemy'} ${d?.card.name} in the ${LANE_NAMES[lane].toLowerCase()} lane, ${u.atk} attack, ${u.hp} health` : `${side === 'you' ? 'Your' : 'Enemy'} empty ${LANE_NAMES[lane].toLowerCase()} lane`}>
        <div className="slot-pad" />
        {u && d && (
          <div className={`unit ${attacking ? `lunge-${side}` : ''} ${hitHere ? 'hit' : ''} ${dropping ? 'drop-in' : ''} ${dying ? 'dying' : ''} ${u.fortify ? 'fortified' : ''}`} key={u.id}>
            <div className="unit-shadow" />
            <div className="unit-stand">
              <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} />
              <div className="unit-stats">
                <span className={`us-atk ${nextAtk && nextAtk.atk > u.atk ? 'up' : nextAtk && nextAtk.atk < u.atk ? 'down' : ''}`} title={nextAtk ? `Attacks for ${nextAtk.atk} next` : 'Attack'}>{nextAtk ? nextAtk.atk : u.atk}</span>
                <span className={`us-hp ${u.hp < u.maxHp ? 'hurt' : ''}`}>{u.hp}</span>
              </div>
              <div className="unit-flags">
                {u.fortify && <i title="Fortified">⛨</i>}{u.burn > 0 && <i title="Burning">🔥</i>}{u.hex > 0 && <i title="Hexed">☍</i>}{u.buff > 0 && <i title="Rallied">▲</i>}
              </div>
            </div>
          </div>
        )}
        <div className="slot-pops">{pops.filter((p) => p.side === side && p.lane === lane).map((p) => <span key={p.id} className={`pop pop-${p.kind}`}>{p.text}</span>)}</div>
      </div>
    )
  }

  const leaderHit = (side) => fx?.t === 'attack' && fx.side !== side && (fx.target === 'leader' || fx.through)
  const Leader = ({ side }) => {
    const L = disp[side].leader
    const pct = Math.max(0, L) / LEADER_HP
    return (
      <div className={`leader leader-${side} ${leaderHit(side) ? 'hit' : ''}`}>
        <Avatar seed={side === 'you' ? 'player:' + snap.player.name : r.id} size={side === 'you' ? 40 : 44} ring={side === 'you' ? 'var(--accent)' : tierColor(r.level)} />
        <div className="ld-main">
          <div className="ld-name">{side === 'you' ? snap.player.name : <>{r.name} <span className="ld-lv"><Crest lvl={r.level} size={14} /> LV {r.level}</span></>}</div>
          <div className="ld-bar"><i style={{ width: `${pct * 100}%` }} /><span className="mono">{Math.max(0, L)}/{LEADER_HP}</span></div>
        </div>
        <div className="ld-side">
          {side === 'them' ? <span className="ld-hand" title="Cards in their hand">{Array.from({ length: Math.min(7, b.them.handCount) }, (_, k) => <i key={k} />)}<b className="mono">{b.them.handCount}</b></span> : null}
          <span className="ld-deck mono" title="Cards left in deck">▤ {disp[side].deckCount ?? b[side].deckCount}</span>
        </div>
        <div className="ld-pops">{pops.filter((p) => p.side === side && p.lane === 'leader').map((p) => <span key={p.id} className={`pop pop-${p.kind}`}>{p.text}</span>)}</div>
      </div>
    )
  }

  const menuUnit = menu && disp[menu.side].board[menu.lane]
  const menuAtk = menuUnit && attackOf(view, menu.side, menu.lane)
  const md = menuUnit && resolve(menuUnit.ref)

  return (
    <div className={`duel theme-${league}`} role="dialog" aria-modal="true" aria-label={`Duel against ${r.name}`}>
      <div className="room" aria-hidden="true"><div className="room-lamp" /><div className="room-glow" /></div>

      <Leader side="them" />

      <div className="scene">
        <div className="table3d">
          <div className="table-top">
            <div className="table-trim" />
            <div className="table-mat">
              {Array.from({ length: LANES }, (_, lane) => {
                const el = EL[b.terrain[lane]]
                return (
                  <div key={lane} className="lane" style={{ '--ec': el.color }}>
                    <Slot side="them" lane={lane} />
                    <div className="terrain" title={`${el.name} terrain: ${el.name} units get +2 ATK here`}><span>{el.glyph}</span><b>{el.name.toUpperCase()}</b></div>
                    <Slot side="you" lane={lane} />
                  </div>
                )
              })}
            </div>
          </div>
          <div className="table-edge" />
        </div>
        {banner && <div className="turn-banner">{banner === 'start' ? 'DUEL START' : banner === 'you' ? 'YOUR TURN' : `${r.name.toUpperCase()}'S TURN`}</div>}
        {busy && b.turn !== 'you' && !fx && <div className="thinking mono">{r.name} is thinking…</div>}
      </div>

      <Leader side="you" />

      <div className="dock">
        <div className="energy" aria-label={`Energy ${energy} of ${disp.you.maxEnergy ?? b.you.maxEnergy}`}>
          {Array.from({ length: MAX_ENERGY }, (_, k) => <i key={k} className={k < energy ? 'on' : k < (disp.you.maxEnergy ?? b.you.maxEnergy) ? 'spent' : ''} />)}
          <span className="mono">{energy}/{disp.you.maxEnergy ?? b.you.maxEnergy}</span>
        </div>
        <div className="dock-mid mono">
          <div>TURN {b.you.turns}/{TURN_LIMIT}</div>
          <div className="dock-pot">{b.wager.type === 'coins' && b.wager.amount > 0 ? `POT ${fmt(b.wager.amount * 2)}` : b.wager.type === 'card' ? 'CARD BET' : 'FRIENDLY'}</div>
          <button className="duel-quit" onClick={forfeit} disabled={b.status !== 'active' || busy}>FORFEIT</button>
        </div>
        <button className="end-turn" onClick={endTurn} disabled={!myTurn}>END TURN ▶</button>
      </div>

      {selCard ? (
        <div className="sel-strip">
          <b>{resolve(selCard.ref)?.card.name}</b>
          <span className="mono">⚡{selCard.unit.cost} · ATK {selCard.unit.atk} · HP {selCard.unit.hp} · {EL[selCard.unit.element]?.glyph} {EL[selCard.unit.element]?.name}</span>
          <span className="fine">{selCard.unit.cost > energy ? `Needs ${selCard.unit.cost} energy — you have ${energy}.` : 'Tap a glowing lane to play it.'}{selCard.unit.abilities.length ? ' · ' + selCard.unit.abilities.join(', ') : ''}</span>
        </div>
      ) : shiftFrom != null ? <div className="sel-strip"><b>Shift</b><span className="fine">Tap an empty lane on your side.</span></div>
        : <div className="sel-strip quiet"><span className="fine">{myTurn ? 'Tap a card, then a lane. Tap a unit for its numbers and tactics.' : busy ? ' ' : ''}</span></div>}

      <div className="hand3d">
        {b.you.hand.map((c, i) => {
          const d = resolve(c.ref)
          const n = b.you.hand.length, off = i - (n - 1) / 2
          const affordable = c.unit.cost <= energy
          return d && (
            <button key={c.id} className={`hcard ${sel === i ? 'sel' : ''} ${affordable && myTurn ? 'ok' : 'no'}`} style={{ '--r': `${off * 5}deg`, '--y': `${Math.abs(off) * 6}px` }}
              onClick={() => { play('click'); setMenu(null); setShiftFrom(null); setSel(sel === i ? null : i) }}
              aria-label={`${d.card.name}: costs ${c.unit.cost}, attack ${c.unit.atk}, health ${c.unit.hp}`}>
              <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} stats={c.unit} />
              <span className="hc-cost">{c.unit.cost}</span>
            </button>
          )
        })}
        {!b.you.hand.length && <span className="fine">No cards in hand</span>}
      </div>

      <div className="feed" aria-live="polite">{feed.slice(0, 2).map((l, k) => <div key={k + l}>{l}</div>)}</div>

      {menu && menuUnit && md && (
        <div className="sheet-back" onClick={() => setMenu(null)}>
          <div className="sheet unit-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${md.card.name} details`}>
            <div className="sheet-card"><CardFrame card={md.card} rarity={md.rarity} frame={md.frame} footRight={md.footRight} size="sm" tilt={false} showCount={false} /></div>
            <div className="sheet-info">
              <h3>{md.card.name} <span className="cpu-tag">{menu.side === 'you' ? 'YOURS' : `${r.name}'s`} · {LANE_NAMES[menu.lane]} LANE</span></h3>
              <StatTiles stats={menuUnit} />
              <Abilities list={menuUnit.abilities} />
              {menuAtk && (
                <div className="atk-preview">
                  <div className="label">NEXT ATTACK</div>
                  <div className="ap-parts">{menuAtk.parts.map((p) => <span key={p.k} className={`bonus ${p.v < 0 ? 'neg' : ''}`}>{p.label} {p.k === 'base' ? p.v : (p.v > 0 ? '+' : '') + p.v}</span>)}</div>
                  <p>Hits {menuAtk.target === 'leader' ? <b>the {menu.side === 'you' ? "rival's" : 'your'} leader</b> : <b>{unitName(disp[menu.side === 'you' ? 'them' : 'you'].board[menu.lane])}</b>} for <b>{menuAtk.dmg}</b>{menuAtk.blocked ? ` (${menuAtk.blocked} blocked)` : ''}.</p>
                </div>
              )}
              {menuUnit.fortify && <p className="fine">Fortified: blocks 4 from every hit until its owner's next turn.</p>}
              {menuUnit.burn > 0 && <p className="fine">Burning: takes {menuUnit.burn} at the start of its owner's turn.</p>}
              {menuUnit.hex > 0 && <p className="fine">Hexed: −{menuUnit.hex} ATK.</p>}
            </div>
            {menu.side === 'you' && myTurn ? (
              <div className="stance-btns">
                <button className="stance guard" disabled={menuUnit.fortify || energy < TACTIC_COST} onClick={() => act((s) => s.useTactic(b.id, 'fortify', menu.lane))}>
                  <span className="st-ic">⛨</span><span className="st-main">FORTIFY ⚡{TACTIC_COST}</span><span className="st-sub">{menuUnit.fortify ? 'Already fortified' : 'Blocks 4 from every hit until your next turn'}</span>
                </button>
                <button className="stance strike" disabled={menuUnit.shifted || energy < TACTIC_COST || disp.you.board.every((x) => x)} onClick={() => { play('click'); setShiftFrom(menu.lane); setMenu(null) }}>
                  <span className="st-ic">⇄</span><span className="st-main">SHIFT ⚡{TACTIC_COST}</span><span className="st-sub">{menuUnit.shifted ? 'Already moved this turn' : 'Move it to an empty lane'}</span>
                </button>
              </div>
            ) : null}
            <button className="link sheet-close" onClick={() => setMenu(null)}>Close</button>
          </div>
        </div>
      )}

      {showResult && b.status !== 'active' && <Result b={b} onClose={onClose} onRematch={() => onRematch(r)} />}
    </div>
  )
}
