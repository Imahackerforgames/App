import { useEffect, useMemo, useRef, useState } from 'react'
import CardFrame from './Card.jsx'
import Fighter, { weaponFor, WEAPON_NAMES } from './Fighter.jsx'
import Avatar from './Avatar.jsx'
import { Btn } from './ui.jsx'
import { useGame, fmt, useArtUrl } from '../store.jsx'
import { useResolve, Result, tierColor, leagueOf, Crest, Abilities, StatTiles } from '../pages/Arena.jsx'
import { ELEMENTS, LANES, LEADER_HP, MAX_ENERGY, TURN_LIMIT, TACTIC_COST, attackOf, canPlay } from '../server/battle.js'
import { play } from '../lib/sound.js'
import { TUT_STEPS, TutorialBubble } from './Tutorial.jsx'

// The duel, played on a 3D table. The server decides everything; this
// component sends taps ("play card 2 in lane 0", "end turn") and animates the
// events that come back, one by one.

const EL = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const DUR = { turn: 1000, draw: 200, play: 950, attack: 950, die: 520, burn: 520, rally: 420, hex: 420, fortify: 420, shift: 480, nobattle: 600, timeup: 900 }
const LANE_NAMES = ['LEFT', 'MIDDLE', 'RIGHT']

export default function Table({ initial, onClose, onRematch, engine = null, tutorial = false }) {
  const { call, snap, toast } = useGame()
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
  const [guide, setGuide] = useState(() => { if (tutorial) return false; try { return !localStorage.getItem('orvel:guideSeen') } catch { return false } })
  // tutorial: which step Pip is on; null when not in the tutorial
  const [tStep, setTStep] = useState(tutorial ? 0 : null)
  const [nudge, setNudge] = useState(0)
  const tcur = tStep != null ? TUT_STEPS[tStep] : null
  const tLocked = !!tcur && tcur.wait !== 'free'
  const advance = () => setTStep((n) => (n == null ? n : Math.min(n + 1, TUT_STEPS.length - 1)))
  const nudgeIt = () => { play('error'); setNudge(Date.now()) }
  const hl = (key) => (tcur?.hl === key ? 'tut-hl' : '')
  const closeGuide = () => { setGuide(false); try { localStorage.setItem('orvel:guideSeen', '1') } catch {} }
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
    let announced = null
    for (const e of events) {
      if (!alive.current) return
      if ((e.t === 'attack' || e.t === 'nobattle') && announced !== e.side && e.t !== 'nobattle') {
        announced = e.side
        setFx(null)
        setBanner(e.side === 'you' ? 'youatk' : 'themattack')
        play('charge', 2)
        await sleep(900)
      }
      setFx(e)
      const before = e.snap
      if (e.t === 'turn') { setBanner(e.side === 'you' ? 'you' : 'them'); play(e.side === 'you' ? 'turn' : 'click') }
      if (e.t === 'play') { play('flip'); setTimeout(() => play('reveal', 1), 420); say(`${e.side === 'you' ? 'You sent' : `${r.name} sent`} ${resolve(e.card.ref)?.card.name} into the ${LANE_NAMES[e.lane].toLowerCase()} lane`) }
      if (e.t === 'attack') {
        const target = e.side === 'you' ? 'them' : 'you'
        await sleep(380) // the fighter charges, then the hit lands
        play('hit', e.dmg >= 8)
        if (e.target === 'leader') { pop(target, 'leader', `−${e.dmg}`, 'dmg'); say(`${e.side === 'you' ? 'Your' : `${r.name}'s`} ${LANE_NAMES[e.lane].toLowerCase()} fighter found an empty lane and hit ${e.side === 'you' ? r.name : 'you'} for ${e.dmg}`) }
        else {
          pop(target, e.lane, e.dmg ? `−${e.dmg}` : 'BLOCKED', e.dmg ? 'dmg' : 'block')
          if (e.blocked) pop(target, e.lane, `⛨ ${e.blocked}`, 'block')
          if (e.back) pop(e.side, e.lane, `−${e.back}`, 'dmg')
          if (e.through) pop(target, 'leader', `−${e.through}`, 'dmg')
          say(`${e.side === 'you' ? 'Your' : `${r.name}'s`} ${LANE_NAMES[e.lane].toLowerCase()} fighter hit the fighter across for ${e.dmg}${e.through ? ` (+${e.through} through)` : ''}${e.back ? `, took ${e.back} back` : ''}`)
        }
        if (e.heal) pop(e.side, 'leader', `+${e.heal}`, 'heal')
      }
      if (e.t === 'die') { play('back'); say(`${e.side === 'you' ? 'Your' : `${r.name}'s`} ${LANE_NAMES[e.lane].toLowerCase()} fighter was knocked out`) }
      if (e.t === 'burn') { pop(e.side, e.lane, `🔥−${e.dmg}`, 'burn'); play('hit') }
      if (e.t === 'fortify') { pop(e.side, e.lane, '⛨ FORTIFIED', 'guard'); play('guard') }
      if (e.t === 'rally') { pop(e.side, e.lane, 'RALLY +2', 'heal'); play('coin') }
      if (e.t === 'hex') { pop(e.side === 'you' ? 'them' : 'you', e.lane, 'HEX −3', 'hex'); play('error') }
      if (e.t === 'shift') play('swipe')
      if (e.t === 'nobattle') say(`${e.side === 'you' ? 'Your' : `${r.name}'s`} fighters rest on the very first turn — attacks start next turn`)
      if (e.t === 'die') {
        // keep the fallen unit on the table while it topples, then clear it
        setFx({ ...e, ghost: dispRef.current[e.side].board[e.lane] })
        await sleep(DUR.die)
        setDisp({ you: before.you, them: before.them })
        continue
      }
      setDisp({ you: before.you, them: before.them })
      await sleep(e.t === 'attack' ? DUR.attack - 380 : DUR[e.t] ?? 400)
    }
    setFx(null)
    setDisp({ you: final.you, them: final.them })
    if (final.status !== 'active') { await sleep(600); setShowResult(true); play(final.status === 'won' ? 'cash' : 'back') }
  }

  async function act(fn, after) {
    if (busy) return
    setBusy(true); setMenu(null); setSel(null); setShiftFrom(null)
    try {
      const nb = engine ? await fn(engine) : await call(fn)
      setB(nb)
      await animate(nb.events || [], nb)
      after?.()
    } catch (e) { if (engine) { play('error'); toast(e.message, 'error') } } finally { if (alive.current) setBusy(false) }
  }
  const playTo = (lane) => act((s) => s.playCard(b.id, sel, lane), () => { if (tcur?.wait === 'play') advance() })
  const endTurn = () => {
    if (tLocked && tcur.wait !== 'end') return nudgeIt()
    play('click'); act((s) => s.endTurn(b.id), () => { if (tcur?.wait === 'end') advance() })
  }
  const forfeit = () => act((s) => s.forfeit(b.id))

  // A game-shaped object for the shared rule helpers (attack previews etc.)
  const view = useMemo(() => ({ terrain: b.terrain, turn: b.turn, over: b.status !== 'active', you: { ...b.you, ...disp.you }, them: { ...b.them, ...disp.them, hand: [] } }), [b, disp])

  function tapSlot(side, lane) {
    const u = disp[side].board[lane]
    if (side === 'you' && sel != null && !u && myTurn) {
      if (tLocked && !(tcur.wait === 'play' && tcur.allowLane?.(lane))) return nudgeIt()
      if (!canPlay(view, 'you', sel, lane)) return playTo(lane)
    }
    if (side === 'you' && shiftFrom != null && !u && myTurn) return act((s) => s.useTactic(b.id, 'shift', shiftFrom, lane))
    if (u) {
      if (tLocked && !tcur.allowUnitTap) return nudgeIt()
      play('click'); setSel(null); setShiftFrom(null); setMenu({ side, lane })
    }
  }

  const energy = disp.you.energy ?? b.you.energy
  const selCard = sel != null ? b.you.hand[sel] : null
  const canPlaySomething = myTurn && b.you.hand.some((c) => c.unit.cost <= energy) && disp.you.board.some((x) => !x)
  const step = b.status !== 'active' ? null : !myTurn ? 0 : sel != null || shiftFrom != null ? 2 : canPlaySomething ? 1 : 3

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
      <div className={`slot slot-${side} ${canDrop && (!tLocked || tcur.allowLane?.(lane)) ? 'drop' : ''} ${menu?.side === side && menu?.lane === lane ? 'focus' : ''} ${hl(`lane-${side}-${lane}`)} ${hl(`unit-${side}-${lane}`)}`} onClick={() => tapSlot(side, lane)}
        role="button" tabIndex={0} aria-label={u ? `${side === 'you' ? 'Your' : 'Enemy'} ${d?.card.name} in the ${LANE_NAMES[lane].toLowerCase()} lane, ${u.atk} attack, ${u.hp} health` : `${side === 'you' ? 'Your' : 'Enemy'} empty ${LANE_NAMES[lane].toLowerCase()} lane`}>
        <div className="slot-pad" />
        {u && d && (
          <div className={`unit ${attacking ? `lunge-${side}` : ''} ${hitHere ? 'hit' : ''} ${dropping ? 'drop-in' : ''} ${dying ? 'dying' : ''} ${u.fortify ? 'fortified' : ''}`} key={u.id}>
            <div className="unit-shadow" />
            <div className="unit-stand">
              {dropping && <div className="summon-card"><CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} /></div>}
              <div className={dropping ? 'summon-fighter' : 'fighter-wrap'}><FighterArt d={d} u={u} side={side} /></div>
              {dropping && <div className="summon-flash" />}
              <div className="unit-stats">
                <span className={`us-atk ${nextAtk && nextAtk.atk > u.atk ? 'up' : nextAtk && nextAtk.atk < u.atk ? 'down' : ''}`} title={nextAtk ? `Hits for ${nextAtk.atk} next` : 'Damage'}><i>⚔</i>{nextAtk ? nextAtk.atk : u.atk}</span>
                <span className={`us-hp ${u.hp < u.maxHp ? 'hurt' : ''}`} title="Health"><i>♥</i>{u.hp}</span>
              </div>
              {side === 'you' && myTurn && nextAtk && b.you.turns > 0 && !dropping && (
                <div className={`atk-chip ${nextAtk.target}`}>{nextAtk.target === 'leader' ? `↑ ${nextAtk.dmg} to ${r.name}` : `↑ ${nextAtk.dmg}`}</div>
              )}
              <div className="unit-flags">
                {u.fortify && <i title="Fortified">⛨</i>}{u.burn > 0 && <i title="Burning">🔥</i>}{u.hex > 0 && <i title="Hexed">☍</i>}{u.buff > 0 && <i title="Rallied">▲</i>}
              </div>
            </div>
          </div>
        )}
        {hitHere && <span className="slash" key={fx.snap ? JSON.stringify(fx.snap[side].board[lane]?.hp) : 'x'} />}
        <div className="slot-pops">{pops.filter((p) => p.side === side && p.lane === lane).map((p) => <span key={p.id} className={`pop pop-${p.kind}`}>{p.text}</span>)}</div>
      </div>
    )
  }

  const leaderHit = (side) => fx?.t === 'attack' && fx.side !== side && (fx.target === 'leader' || fx.through)
  const Leader = ({ side }) => {
    const L = disp[side].leader
    const pct = Math.max(0, L) / LEADER_HP
    return (
      <div className={`leader leader-${side} ${leaderHit(side) ? 'hit' : ''} ${hl('hp')}`}>
        <Avatar seed={side === 'you' ? 'player:' + snap.player.name : r.id} size={side === 'you' ? 40 : 44} ring={side === 'you' ? 'var(--accent)' : tierColor(r.level)} />
        <div className="ld-main">
          <div className="ld-name">{side === 'you' ? snap.player.name : <>{r.name} <span className="ld-lv"><Crest lvl={r.level} size={14} /> LV {r.level}</span></>}</div>
          <div className="ld-bar"><i style={{ width: `${pct * 100}%` }} /><span className="mono">{Math.max(0, L)}/{LEADER_HP}</span></div>
        </div>
        <div className="ld-side">
          {side === 'them' ? <span className="ld-hand" title="Cards in their hand">{Array.from({ length: Math.min(7, b.them.handCount) }, (_, k) => <i key={k} />)}<b className="mono">{b.them.handCount}</b></span> : null}
          <span className="ld-deck mono" title="Cards left in deck">▤ {disp[side].deckCount ?? b[side].deckCount}</span>
        </div>
        {leaderHit(side) && <span className="slash wide" />}
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
              <div className="row-label top">{r.name.toUpperCase()}'S SIDE</div>
              <div className="row-label bottom">YOUR SIDE</div>
              {Array.from({ length: LANES }, (_, lane) => {
                const el = EL[b.terrain[lane]]
                return (
                  <div key={lane} className="lane" style={{ '--ec': el.color }}>
                    <Slot side="them" lane={lane} />
                    <div className={`terrain ${hl('terrain')}`} title={`${el.name} lane: ${el.name} fighters hit +2 harder here`}><span>{el.glyph}</span><b>{el.name.toUpperCase()} +2</b></div>
                    <Slot side="you" lane={lane} />
                  </div>
                )
              })}
            </div>
          </div>
          <div className="table-edge" />
        </div>
        {banner && <div className={`turn-banner b-${banner}`}>{{ start: 'DUEL START', you: 'YOUR TURN', them: `${r.name.toUpperCase()}'S TURN`, youatk: 'YOUR FIGHTERS ATTACK!', themattack: `${r.name.toUpperCase()} ATTACKS!` }[banner]}</div>}
        <div className="feed" aria-live="polite">{feed.slice(0, 1).map((l) => <div key={l}>{l}</div>)}</div>
        <button className="guide-btn" onClick={() => { play('click'); setGuide(true) }} aria-label="How to play">?</button>
        {busy && b.turn !== 'you' && !fx && <div className="thinking mono">{r.name} is thinking…</div>}
      </div>

      <Leader side="you" />

      <div className="dock">
        <div className={`energy ${hl('energy')}`} aria-label={`Energy ${energy} of ${disp.you.maxEnergy ?? b.you.maxEnergy}`}>
          {Array.from({ length: MAX_ENERGY }, (_, k) => <i key={k} className={k < energy ? 'on' : k < (disp.you.maxEnergy ?? b.you.maxEnergy) ? 'spent' : ''} />)}
          <span className="mono">{energy}/{disp.you.maxEnergy ?? b.you.maxEnergy}</span>
        </div>
        <div className="dock-mid mono">
          <div>TURN {b.you.turns}/{TURN_LIMIT}</div>
          <div className="dock-pot">{b.wager.type === 'coins' && b.wager.amount > 0 ? `POT ${fmt(b.wager.amount * 2)}` : b.wager.type === 'card' ? 'CARD BET' : 'FRIENDLY'}</div>
          {!tutorial && <button className="duel-quit" onClick={forfeit} disabled={b.status !== 'active' || busy}>FORFEIT</button>}
        </div>
        <button className={`end-turn ${step === 3 ? 'ready' : ''} ${hl('end')}`} onClick={endTurn} disabled={!myTurn}>END TURN<small>fighters attack</small></button>
      </div>

      <Coach step={step} selCard={selCard} energy={energy} rivalName={r.name} shift={shiftFrom != null} name={selCard ? resolve(selCard.ref)?.card.name : ''} over={b.status !== 'active'} />

      <div className="hand3d">
        {b.you.hand.map((c, i) => {
          const d = resolve(c.ref)
          const n = b.you.hand.length, off = i - (n - 1) / 2
          const affordable = c.unit.cost <= energy
          return d && (
            <button key={c.id} className={`hcard ${sel === i ? 'sel' : ''} ${affordable && myTurn ? 'ok' : 'no'} ${tcur?.hl === 'hand0' && i === 0 ? 'tut-hl' : ''}`} style={{ '--r': `${off * 5}deg`, '--y': `${Math.abs(off) * 6}px` }}
              onClick={() => {
                if (tLocked && !((tcur.wait === 'select' || tcur.wait === 'play') && tcur.allowSelect?.(i))) return nudgeIt()
                play('click'); setMenu(null); setShiftFrom(null); setSel(sel === i ? null : i)
                if (tcur?.wait === 'select') advance()
              }}
              aria-label={`${d.card.name}: costs ${c.unit.cost}, attack ${c.unit.atk}, health ${c.unit.hp}`}>
              <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} stats={c.unit} />
              <span className="hc-cost">{c.unit.cost}</span>
            </button>
          )
        })}
        {!b.you.hand.length && <span className="fine">No cards in hand</span>}
      </div>


      {menu && menuUnit && md && (
        <div className="sheet-back" onClick={() => setMenu(null)}>
          <div className="sheet unit-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${md.card.name} details`}>
            <div className="sheet-card"><CardFrame card={md.card} rarity={md.rarity} frame={md.frame} footRight={md.footRight} size="sm" tilt={false} showCount={false} /></div>
            <div className="sheet-info">
              <h3>{md.card.name} <span className="cpu-tag">{menu.side === 'you' ? 'YOUR FIGHTER' : `${r.name}'s FIGHTER`} · {LANE_NAMES[menu.lane]} LANE</span></h3>
              <p className="fine">Weapon: {WEAPON_NAMES[weaponFor(menuUnit)]}</p>
              <StatTiles stats={menuUnit} />
              <Abilities list={menuUnit.abilities} />
              {menuAtk && (
                <div className="atk-preview">
                  <div className="label">WHEN {menu.side === 'you' ? 'YOU END YOUR TURN' : `${r.name.toUpperCase()} ENDS THEIR TURN`}</div>
                  <div className="ap-parts">{menuAtk.parts.map((p) => <span key={p.k} className={`bonus ${p.v < 0 ? 'neg' : ''}`}>{p.label} {p.k === 'base' ? p.v : (p.v > 0 ? '+' : '') + p.v}</span>)}</div>
                  <p>Charges up its lane and hits {menuAtk.target === 'leader' ? <b>{menu.side === 'you' ? r.name : 'you'} directly (the lane is empty)</b> : <b>{unitName(disp[menu.side === 'you' ? 'them' : 'you'].board[menu.lane])}</b>} for <b>{menuAtk.dmg}</b>{menuAtk.blocked ? ` (${menuAtk.blocked} blocked)` : ''}.</p>
                </div>
              )}
              {menuUnit.fortify && <p className="fine">Fortified: blocks 4 from every hit until its owner's next turn.</p>}
              {menuUnit.burn > 0 && <p className="fine">Burning: takes {menuUnit.burn} at the start of its owner's turn.</p>}
              {menuUnit.hex > 0 && <p className="fine">Hexed: −{menuUnit.hex} ATK.</p>}
            </div>
            {menu.side === 'you' && myTurn ? (
              <div className="stance-btns">
                <button className="stance guard" disabled={menuUnit.fortify || energy < TACTIC_COST} onClick={() => act((s) => s.useTactic(b.id, 'fortify', menu.lane), () => { if (tcur?.wait === 'tactic') advance() })}>
                  <span className="st-ic">⛨</span><span className="st-main">FORTIFY ⚡{TACTIC_COST}</span><span className="st-sub">{menuUnit.fortify ? 'Already fortified' : 'Blocks 4 from every hit until your next turn'}</span>
                </button>
                <button className="stance strike" disabled={tLocked || menuUnit.shifted || energy < TACTIC_COST || disp.you.board.every((x) => x)} onClick={() => { play('click'); setShiftFrom(menu.lane); setMenu(null) }}>
                  <span className="st-ic">⇄</span><span className="st-main">SHIFT ⚡{TACTIC_COST}</span><span className="st-sub">{menuUnit.shifted ? 'Already moved this turn' : 'Move it to an empty lane'}</span>
                </button>
              </div>
            ) : null}
            <button className="link sheet-close" onClick={() => setMenu(null)}>Close</button>
          </div>
        </div>
      )}

      {tcur && !showResult && <TutorialBubble key={tStep + ':' + nudge} step={tcur} onNext={advance} onSkip={onClose} />}
      {guide && <HowToFight onClose={closeGuide} />}
      {tutorial && showResult && b.status !== 'active' && <TutorialDone status={b.status} onClose={onClose} />}
      {!tutorial && showResult && b.status !== 'active' && <Result b={b} onClose={onClose} onRematch={() => onRematch(r)} />}
    </div>
  )
}

function FighterArt({ d, u, side }) {
  const art = useArtUrl(d.card)
  return <Fighter unit={u} art={art} rarity={d.rarity} side={side} />
}

// The three-step helper under the table.
function Coach({ step, selCard, energy, rivalName, shift, name, over }) {
  if (step == null) return <div className="coach"><div className="coach-msg">{over ? 'The duel is over.' : ''}</div></div>
  const steps = [['1', 'PICK A CARD'], ['2', 'PLACE IT'], ['3', 'END TURN']]
  let msg
  if (step === 0) msg = `${rivalName}'s turn — watch where they place fighters.`
  else if (step === 1) msg = 'Pick a card from your hand. The blue number is its energy cost.'
  else if (shift) msg = 'Tap an empty spot on your side to move your fighter there.'
  else if (selCard && selCard.unit.cost > energy) msg = `${name} costs ${selCard.unit.cost} energy — you have ${energy}. Pick a cheaper card.`
  else msg = `Tap a glowing spot on YOUR side to send ${name} into that lane.`
  if (step === 3) msg = 'All set? Tap END TURN — every fighter you have charges up its lane and attacks.'
  return (
    <div className="coach" aria-live="polite">
      <div className="coach-steps">{steps.map(([n, l], i) => <span key={n} className={`cs ${step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}`}><b>{n}</b>{l}</span>)}</div>
      <div className="coach-msg">{msg}</div>
    </div>
  )
}

// Step-by-step rules, shown before the first duel and behind the ? button.
export function HowToFight({ onClose }) {
  const steps = [
    ['🎯', 'The goal', 'Each side has a hero with 25 HP. You are the bottom bar, your rival is the top bar. Knock their HP to 0 to win. If nobody falls after 10 turns each, the hero with more HP wins.'],
    ['⚡', 'Energy', 'At the start of each turn you get energy: 2 on your first turn, 3 on the next, up to 6. Every card shows its cost in a blue circle.'],
    ['🃏', 'Place fighters', 'Tap a card in your hand, then tap one of the three glowing spots on your side of the table. The card turns into a fighter. ⚔ is how hard it hits. ♥ is its health.'],
    ['⚔', 'End turn = attack', 'Tap END TURN. Each of your fighters charges straight up its lane. If an enemy fighter stands across from it, it hits that fighter. If the lane is empty, it hits the rival hero directly. (Nobody attacks on the very first turn.)'],
    ['🔁', 'Their turn', 'Your rival does the same: places fighters, then attacks down the lanes. A fighter whose ♥ reaches 0 is knocked out and leaves the table.'],
    ['💡', 'How to win', 'Block lanes where their strong fighters are. Attack through empty lanes to hit their hero. Each lane has an element: a fighter of that element hits +2 there. Ember ▲ beats Gale ❖, Gale beats Tide ≈, Tide beats Ember: +3 when you hit a fighter you beat.'],
    ['🛡', 'Tactics', 'Tap one of your fighters to Fortify it (blocks 4 damage from every hit until your next turn) or Shift it to an empty lane. Each costs 1 energy.'],
  ]
  return (
    <div className="sheet-back guide-back" onClick={onClose}>
      <div className="sheet guide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="How a duel works">
        <h3 className="guide-title">HOW A DUEL WORKS</h3>
        <ol className="guide-steps">
          {steps.map(([ic, t, d], i) => <li key={t}><span className="gs-n">{i + 1}</span><span className="gs-ic" aria-hidden="true">{ic}</span><div><b>{t}</b><p>{d}</p></div></li>)}
        </ol>
        <Btn onClick={onClose}>Got it — let's fight</Btn>
      </div>
    </div>
  )
}

// End of the tutorial: claim the one-time reward from the server.
function TutorialDone({ status, onClose }) {
  const { call } = useGame()
  const [r, setR] = useState(null)
  useEffect(() => { call((sv) => sv.completeTutorial()).then(setR).catch(() => setR({ reward: 0 })) }, [])
  return (
    <div className={`bt-result ${status === 'won' ? 'won' : 'draw'}`}>
      {status === 'won' && <div className="confetti" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>}
      <div className="br-title">TUTORIAL COMPLETE</div>
      <p>{status === 'won' ? 'You beat Pip!' : status === 'lost' ? 'Pip won this one — but now you know how it works.' : 'A draw!'}</p>
      {r == null ? <p className="mono blink">…</p> : r.reward > 0 ? <div className="br-pay">+<span className="mono">{r.reward}</span> coins</div> : <p className="fine">The tutorial reward has already been claimed on this account.</p>}
      <p className="fine">Real duels work exactly the same way. Bet coins or a card against a rival and a win pays double.</p>
      <div className="op-sum-btns"><Btn onClick={onClose}>To the Arena</Btn></div>
    </div>
  )
}
