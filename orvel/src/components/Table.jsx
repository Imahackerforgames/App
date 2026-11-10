import { useEffect, useMemo, useRef, useState } from 'react'
import CardFrame, { levelTier } from './Card.jsx'
import Fighter, { weaponFor, loadoutOf, WEAPON_NAMES, OUTFIT_NAMES, STYLE, MOVES } from './Fighter.jsx'
import Avatar, { playerPic } from './Avatar.jsx'
import { Btn } from './ui.jsx'
import { useGame, fmt, useArtUrl } from '../store.jsx'
import { useResolve, Result, tierColor, leagueOf, Crest, Abilities, StatTiles } from '../pages/Arena.jsx'
import { ELEMENTS, LANES, LEADER_HP, MAX_ENERGY, TURN_LIMIT, TACTIC_COST, attackOf, canPlay } from '../server/battle.js'
import { play } from '../lib/sound.js'
import { TUT_STEPS, TutorialBubble } from './Tutorial.jsx'
import Props from './Props.jsx'
import MapBackdrop from './MapBackdrop.jsx'
import { MAP_ART } from '../lib/mapArt.js'

// The duel, seen from the side at fighter height: your fighters on the left,
// the rival's on the right, three lanes running back to front. The server
// decides everything; this component sends taps ("play card 2 in lane 0",
// "end turn") and acts out the events that come back, one by one — a fighter
// runs across its lane, winds up and strikes, and the damage appears on the
// target at the moment the blow lands, with the sum that produced it.

const EL = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const DUR = { turn: 1000, draw: 200, play: 950, die: 760, burn: 520, rally: 420, hex: 420, fortify: 420, shift: 480, nobattle: 600, timeup: 900 }
const LANE_NAMES = ['BACK', 'MIDDLE', 'FRONT']
// where each lane stands on screen: further lanes sit higher, smaller and
// closer to the centre, like a field seen in perspective
const ROWS = [{ y: 60, s: 0.62, x: [27, 73] }, { y: 78, s: 0.78, x: [20, 80] }, { y: 97, s: 0.96, x: [12, 88] }]
const ELC = { ember: '#ffb04a', tide: '#7fe0ff', gale: '#c6ff6a' }

// The burst where a blow lands: a flash, a shock ring, and particles thrown
// away from the attacker in the attacking fighter's element — sparks and
// embers for Ember, spray for Tide, cut leaves for Gale, and bright metal
// sparks off a block.
function Impact({ seed, el, big, dir }) {
  let x = Math.floor(seed * 1e9) || 7
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff }
  const n = big ? 20 : 13
  return (
    <div className={`fx-impact fx-${el} ${big ? 'big' : ''}`} style={{ '--dir': dir }} aria-hidden="true">
      <span className="fx-flash" /><span className="fx-ring" /><span className="fx-cut" />
      {Array.from({ length: n }, (_, i) => {
        const a = ((rnd() - 0.5) * 150 - 10) * (Math.PI / 180)
        const dist = (big ? 46 : 32) + rnd() * (big ? 56 : 38)
        return <i key={i} style={{ '--dx': `${Math.cos(a) * dist * dir}px`, '--dy': `${Math.sin(a) * dist}px`, '--dl': `${rnd() * 60}ms`, '--sz': `${3 + rnd() * (big ? 6 : 4)}px`, '--rt': `${rnd() * 360}deg` }} />
      })}
    </div>
  )
}

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
  const [swapFrom, setSwapFrom] = useState(null) // lane whose fighter is being swapped out
  const [banner, setBanner] = useState('start')
  const [feed, setFeed] = useState([])
  const [showResult, setShowResult] = useState(initial.status !== 'active')
  // the fight itself: who is moving, who is reeling, where the camera looks
  const [actor, setActor] = useState(null) // { side, lane, pose, dash, back, bolt }
  const [hurt, setHurt] = useState(null) // { key: 'you:1' | 'them:leader', kind: 'hurt' | 'block' | 'dodge', power, n }
  const [cam, setCam] = useState(null)
  const [spark, setSpark] = useState(null)
  const [flash, setFlash] = useState(null)
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
  const stageRef = useRef(null)
  const worldRef = useRef(null)
  const speed = useRef(1)
  const T = (ms) => sleep(ms * speed.current)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => { const p = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = p } }, [])
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(null), 1400); return () => clearTimeout(t) }, [banner])

  const r = b.rival
  const league = leagueOf(r.level).id
  const myTurn = !busy && b.status === 'active' && b.turn === 'you'
  const unitName = (u) => (u ? resolve(u.ref)?.card.name || 'Unit' : 'Unit')

  function pop(side, lane, text, kind, why) {
    const id = Math.random()
    setPops((p) => [...p, { id, side, lane, text, kind, why }])
    setTimeout(() => alive.current && setPops((p) => p.filter((x) => x.id !== id)), 1500)
  }
  const say = (line) => setFeed((f) => [line, ...f].slice(0, 6))
  const whose = (side) => (side === 'you' ? 'Your' : `${r.name}'s`)
  const laneWord = (lane) => LANE_NAMES[lane].toLowerCase()

  // Where a fighter has to go to attack, in its own lane's units (a lane's
  // spot is scaled by its depth, so screen distance is divided by that
  // scale). Fighters stop at their weapon's reach in front of the target, so
  // they never walk through it; with an empty lane they cross to the far edge.
  function reach(side, lane, unit, toLeader) {
    const w = stageRef.current?.getBoundingClientRect().width || 360
    const row = ROWS[lane]
    const from = row.x[side === 'you' ? 0 : 1], to = row.x[side === 'you' ? 1 : 0]
    const dir = side === 'you' ? 1 : -1
    const style = STYLE[weaponFor(unit)] || 'slash'
    const span = ((to - from) / 100) * w / row.s
    if (style === 'cast') return { style, dash: dir * 14, bolt: span - dir * 36, screen: 14 * row.s }
    if (toLeader) return { style, dash: span + dir * 10, bolt: 0, screen: Math.abs(span + dir * 10) * row.s }
    const gap = style === 'thrust' ? 84 : style === 'smash' ? 62 : 54
    const dash = span - dir * gap
    return { style, dash, bolt: 0, screen: Math.abs(dash) * row.s }
  }
  const why = (e) => {
    const parts = (e.parts || []).map((p) => (p.k === 'base' ? `${p.v} ATK` : `${p.v > 0 ? '+' : ''}${p.v} ${p.label.toLowerCase()}`))
    if (e.blocked) parts.push(`−${e.blocked} blocked`)
    return parts.length > 1 ? parts.join(' ') : ''
  }
  // camera shake and hit-stop scaled by how hard the blow was
  function impactFeel(k, freeze) {
    worldRef.current?.animate?.([{ translate: '0 0' }, { translate: `${-5 * k}px ${3 * k}px` }, { translate: `${4 * k}px ${-2 * k}px` }, { translate: `${-2 * k}px ${k}px` }, { translate: '0 0' }], { duration: 160 + 110 * k, easing: 'ease-out' })
    worldRef.current?.classList.add('hitstop')
    setTimeout(() => worldRef.current?.classList.remove('hitstop'), freeze)
  }

  // One fighter's attack, acted out:
  //   approach (walk or run with real steps, speed from its body type) →
  //   plant → its combo, each move with anticipation, contact and recovery,
  //   the target reacting to every blow (hurt, block or dodge, pushed away
  //   from the hit) → walk back to its spot, still facing the enemy.
  // The rules engine has already decided the damage; the combo only splits
  // the moment it lands into readable blows, and the total shows on the last.
  async function strike(e) {
    const target = e.side === 'you' ? 'them' : 'you'
    const u = dispRef.current[e.side].board[e.lane]
    if (!u) { setDisp({ you: e.snap.you, them: e.snap.them }); return }
    const toLeader = e.target === 'leader'
    const g = reach(e.side, e.lane, u, toLeader)
    const L = loadoutOf(u), P = L.profile
    const tgtKey = toLeader ? `${target}:leader` : `${target}:${e.lane}`
    const defender = !toLeader && dispRef.current[target].board[e.lane]
    const defLight = defender && loadoutOf(defender).profile.dodges
    const sp = speed.current
    let n = 0
    setCam(e.lane)
    // 1. approach
    const travel = Math.max(220, Math.min(1100, (g.screen / P.speed) * 1000)) * sp
    const gait = g.style === 'cast' ? 'walk' : P.run ? 'run' : 'walk'
    setActor({ side: e.side, lane: e.lane, pose: gait, dash: g.dash, travel, n: n++ })
    await T(travel / sp)
    if (!alive.current) return
    // 2. combo: a weak blow is one move, a strong one the full string
    const moves = L.moves.slice(0, e.dmg >= 6 || L.moves.length === 1 ? L.moves.length : Math.max(1, L.moves.length - 1))
    for (let i = 0; i < moves.length; i++) {
      const M = MOVES[moves[i]]
      const last = i === moves.length - 1
      const dur = M.dur * P.tempo
      const cast = moves[i] === 'cast'
      const hitAt = cast ? dur * 0.45 + 300 : dur * M.hit
      setActor({ side: e.side, lane: e.lane, pose: 'mv', move: moves[i], dash: g.dash, dur: dur * sp, power: M.power, style: g.style, weapon: L.weapon, bolt: cast ? g.bolt : null, n: n++ })
      play(cast ? 'bolt' : 'swing')
      await T(hitAt)
      if (!alive.current) return
      const blocked = !e.dmg || (e.blocked && !last)
      if (!last) {
        // an early blow: the target reacts; light fighters slip the first one
        const kind = blocked ? 'block' : defLight && i === 0 ? 'dodge' : 'hurt'
        setHurt({ key: tgtKey, kind, power: M.power * 0.7, n: Math.random() })
        if (kind !== 'dodge') {
          setSpark({ key: Math.random(), side: target, lane: e.lane, leader: toLeader, big: false, blocked, el: u.element, from: e.side })
          impactFeel(blocked ? 0.5 : 0.7, 50)
          play(blocked ? 'clang' : 'hit')
        }
        if (moves.length > 1) pop(target, toLeader ? 'leader' : e.lane, `${i + 1} HIT`, 'combo-pop')
      } else {
        // the finishing blow: the real numbers land now
        setDisp({ you: e.snap.you, them: e.snap.them })
        const heavy = e.dmg >= 8 || M.power >= 2
        impactFeel(heavy ? 2 : e.dmg ? 1.1 : 0.6, heavy ? 140 : 80)
        if (heavy) { setFlash(Math.random()); setTimeout(() => alive.current && setFlash(null), 380) }
        setHurt({ key: tgtKey, kind: e.dmg ? 'hurt' : 'block', power: M.power * (e.dmg >= 8 ? 1.4 : 1), n: Math.random() })
        setSpark({ key: Math.random(), side: target, lane: e.lane, leader: toLeader, big: heavy, blocked: !e.dmg, el: u.element, from: e.side })
        if (e.dmg) play('hit', heavy); else play('clang')
        if (toLeader) {
          pop(target, 'leader', `−${e.dmg}`, 'dmg', why(e))
          say(`${whose(e.side)} ${laneWord(e.lane)} fighter crossed the empty lane and hit ${e.side === 'you' ? r.name : 'you'} for ${e.dmg}`)
        } else {
          pop(target, e.lane, e.dmg ? `−${e.dmg}` : 'BLOCKED', e.dmg ? (e.dmg >= 8 ? 'dmg heavy' : 'dmg') : 'block', why(e))
          if (e.through) pop(target, 'leader', `−${e.through}`, 'dmg', 'pierced through')
          say(`${whose(e.side)} ${laneWord(e.lane)} fighter hit ${unitName(dispRef.current[target].board[e.lane])} ${moves.length > 1 ? `with a ${moves.length}-hit combo ` : ''}for ${e.dmg}${e.through ? ` (+${e.through} through)` : ''}${e.back ? `, took ${e.back} back` : ''}`)
        }
        if (e.heal) pop(e.side, 'leader', `+${e.heal}`, 'heal', 'drain')
      }
      // recovery; the next move cancels in before it fully settles
      await T((dur - (cast ? Math.min(dur, hitAt) : hitAt)) * (last ? 1 : 0.55))
      if (!alive.current) return
    }
    if (e.back) { setHurt({ key: `${e.side}:${e.lane}`, kind: 'hurt', power: 0.8, n: Math.random() }); pop(e.side, e.lane, `−${e.back}`, 'dmg', 'counter'); play('hit'); await T(320) }
    // 3. back off to its own spot, facing the enemy the whole way
    setHurt(null); setSpark(null)
    const home = Math.max(220, Math.min(1000, (g.screen / (P.speed * 0.85)) * 1000)) * speed.current
    setActor({ side: e.side, lane: e.lane, pose: 'walkback', dash: 0, travel: home, n: n++ })
    await T(home / speed.current)
    setActor(null)
  }

  async function animate(events, final) {
    let announced = null
    speed.current = 1
    for (const e of events) {
      if (!alive.current) return
      if (e.t === 'attack' && announced !== e.side) {
        announced = e.side
        setFx(null)
        setBanner(e.side === 'you' ? 'youatk' : 'themattack')
        play('charge', 2)
        await T(900)
      }
      setFx(e)
      const before = e.snap
      if (e.t === 'attack') { await strike(e); continue }
      setCam(null)
      if (e.t === 'turn') { setBanner(e.side === 'you' ? 'you' : 'them'); play(e.side === 'you' ? 'turn' : 'click') }
      if (e.t === 'play') { play('flip'); setTimeout(() => play('reveal', 1), 420); say(`${e.side === 'you' ? 'You sent' : `${r.name} sent`} ${resolve(e.card.ref)?.card.name} into the ${laneWord(e.lane)} lane`) }
      if (e.t === 'nobattle') say(`${e.side === 'you' ? 'Your' : `${r.name}'s`} fighters rest on the very first turn — attacks start next turn`)
      if (e.t === 'die') {
        play('back'); say(`${whose(e.side)} ${laneWord(e.lane)} fighter was knocked out`)
        // keep the fallen fighter on the field while it goes down, then clear it
        setFx({ ...e, ghost: dispRef.current[e.side].board[e.lane] })
        pop(e.side, e.lane, 'K.O.', 'ko')
        await T(DUR.die)
        setDisp({ you: before.you, them: before.them })
        continue
      }
      if (e.t === 'burn') { pop(e.side, e.lane, `🔥−${e.dmg}`, 'burn', 'burning'); setHurt({ key: `${e.side}:${e.lane}`, kind: 'hurt', power: 0.6, n: Math.random() }); play('hit') }
      if (e.t === 'fortify') { pop(e.side, e.lane, '⛨ FORTIFIED', 'guard'); play('guard') }
      if (e.t === 'rally') { pop(e.side, e.lane, 'RALLY +2', 'heal'); play('coin') }
      if (e.t === 'hex') { pop(e.side === 'you' ? 'them' : 'you', e.lane, 'HEX −3', 'hex'); play('error') }
      if (e.t === 'shift') play('swipe')
      if (e.t === 'swap') { play('swipe'); setTimeout(() => play('reveal', 1), 380); pop(e.side, e.lane, '⇄ SWAP', 'guard'); say(`${e.side === 'you' ? 'You' : r.name} swapped ${resolve(e.card.ref)?.card.name} in for ${resolve(e.out.ref)?.card.name} in the ${laneWord(e.lane)} lane`) }
      if (e.t === 'swap') { setDisp({ you: before.you, them: before.them }); await T(DUR.play); continue }
      if (e.t === 'timeup') say('Time! The hero with more HP wins.')
      setDisp({ you: before.you, them: before.them })
      await T(DUR[e.t] ?? 400)
      setHurt(null)
    }
    setFx(null); setCam(null); setActor(null)
    setDisp({ you: final.you, them: final.them })
    if (final.status !== 'active') { await sleep(600); setShowResult(true); play(final.status === 'won' ? 'cash' : 'back') }
  }

  async function act(fn, after) {
    if (busy) return
    setBusy(true); setMenu(null); setSel(null); setShiftFrom(null); setSwapFrom(null)
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
    if (busy) { speed.current = 0.45; return } // tap during the fight to hurry it along
    const u = disp[side].board[lane]
    if (side === 'you' && sel != null && !u && myTurn) {
      if (tLocked && !(tcur.wait === 'play' && tcur.allowLane?.(lane))) return nudgeIt()
      if (!canPlay(view, 'you', sel, lane)) return playTo(lane)
    }
    if (side === 'you' && shiftFrom != null && !u && myTurn) return act((s) => s.useTactic(b.id, 'shift', shiftFrom, lane))
    // a bench card is picked and you tap one of your fighters: swap them
    if (side === 'you' && sel != null && u && myTurn && !tLocked) {
      if (u.shifted) { play('error'); return toast('That fighter already moved this turn', 'error') }
      if (energy < TACTIC_COST) { play('error'); return toast(`A swap costs ${TACTIC_COST} energy`, 'error') }
      play('click'); return act((s) => s.useTactic(b.id, 'swap', lane, sel))
    }
    if (u) {
      if (tLocked && !tcur.allowUnitTap) return nudgeIt()
      play('click'); setSel(null); setShiftFrom(null); setMenu({ side, lane })
    }
  }

  const energy = disp.you.energy ?? b.you.energy
  const selCard = sel != null ? b.you.hand[sel] : null
  const canPlaySomething = myTurn && b.you.hand.some((c) => c.unit.cost <= energy) && disp.you.board.some((x) => !x)
  const step = b.status !== 'active' ? null : !myTurn ? 0 : sel != null || shiftFrom != null || swapFrom != null ? 2 : canPlaySomething ? 1 : 3

  // a plain function, not a component: a component declared inside render would
  // remount every render and swallow taps that land mid-update
  const renderSpot = (side, lane) => {
    const row = ROWS[lane]
    const dyingHere = fx?.t === 'die' && fx.side === side && fx.lane === lane && fx.ghost
    const u = dyingHere ? fx.ghost : disp[side].board[lane]
    const d = u && resolve(u.ref)
    const canDrop = side === 'you' && myTurn && !u && ((selCard && !canPlay(view, 'you', sel, lane)) || shiftFrom != null)
    const dropping = (fx?.t === 'play' || fx?.t === 'swap') && fx.side === side && fx.lane === lane
    const moving = actor && actor.side === side && actor.lane === lane ? actor : null
    const reeling = hurt?.key === `${side}:${lane}` ? hurt : null
    // the end of the duel: winners celebrate, losers slump
    const ending = b.status !== 'active' && !fx ? (b.status === 'draw' ? null : (b.status === 'won') === (side === 'you') ? 'victory' : 'defeat') : null
    const pose = dyingHere ? 'die' : moving ? moving.pose : reeling ? reeling.kind : ending || 'idle'
    const nextAtk = u && b.status === 'active' ? attackOf(view, side, lane) : null
    const hpPct = u ? Math.max(0, u.hp) / (u.maxHp || u.hp || 1) : 0
    const tut = tcur?.hl === `lane-${side}-${lane}` || tcur?.hl === `unit-${side}-${lane}`
    return (
      <div key={side + lane} className={`spot spot-${side} ${canDrop && (!tLocked || tcur.allowLane?.(lane)) ? 'drop' : ''} ${menu?.side === side && menu?.lane === lane ? 'focus' : ''} ${tut ? 'tut-spot' : ''} ${moving ? 'acting' : ''} ${u?.fortify ? 'guarding' : ''} ${dyingHere ? 'fading' : ''}`}
        style={{ left: `${row.x[side === 'you' ? 0 : 1]}%`, top: `${row.y}%`, '--s': row.s, zIndex: moving ? 20 : 2 + lane * 2 }}
        onClick={() => tapSlot(side, lane)}
        role="button" tabIndex={0} aria-label={u ? `${side === 'you' ? 'Your' : 'Enemy'} ${d?.card.name} in the ${laneWord(lane)} lane, ${u.atk} attack, ${u.hp} health` : `${side === 'you' ? 'Your' : 'Enemy'} empty ${laneWord(lane)} lane`}>
        <div className="spot-ring" />
        {u && d && (
          <div className="mover" style={{ translate: `${moving ? moving.dash : 0}px 0`, transition: moving?.travel ? `translate ${moving.travel}ms cubic-bezier(.4,0,.6,1)` : 'translate 0s' }}>
            {dropping && <div className="summon-card"><CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} /></div>}
            <div className={dropping ? 'summon-fighter' : 'fighter-wrap'}><FighterArt key={`${pose}:${moving?.n ?? ''}:${reeling?.n ?? ''}`} d={d} u={u} side={side} pose={pose} move={moving?.move} dur={moving?.dur} power={reeling?.power ?? moving?.power} /></div>
            {(moving?.pose === 'run' || moving?.pose === 'walk' || moving?.pose === 'walkback') && <span className="dust" aria-hidden="true"><i /><i /><i /></span>}
            {moving?.pose === 'mv' && moving.style !== 'cast' && <span key={moving.n} className={`trail trail-${moving.style} side-${side}`} style={{ '--tc': ELC[u.element], animationDuration: `${moving.dur}ms` }} aria-hidden="true" />}
            {dyingHere && <span className="ko-burst" aria-hidden="true" />}
            {dropping && <div className="summon-flash" />}
            {!moving && !dyingHere && (
              <div className="plate">
                {u.level != null && <b className={`pl-lv lv-t${levelTier(u.level)}`}>LV {u.level}</b>}
                <span className={`pl-atk ${nextAtk && nextAtk.atk > u.atk ? 'up' : nextAtk && nextAtk.atk < u.atk ? 'down' : ''}`} title="Hits for">⚔{nextAtk ? nextAtk.atk : u.atk}</span>
                <span className="pl-hp" title="Health"><i style={{ width: `${hpPct * 100}%` }} className={hpPct < 0.35 ? 'low' : ''} /><em>{Math.max(0, u.hp)}</em></span>
                <span className="pl-flags">{u.fortify && <i title="Fortified">⛨</i>}{u.burn > 0 && <i title="Burning">🔥</i>}{u.hex > 0 && <i title="Hexed">☍</i>}{u.buff > 0 && <i title="Rallied">▲</i>}</span>
              </div>
            )}
            {side === 'you' && myTurn && nextAtk && b.you.turns > 0 && !dropping && !moving && (
              <div className={`atk-chip ${nextAtk.target}`}>{nextAtk.target === 'leader' ? `→ ${nextAtk.dmg} to ${r.name}` : `→ ${nextAtk.dmg}`}</div>
            )}
          </div>
        )}
        {moving?.bolt != null && <span key={moving.n} className={`bolt bolt-${u?.element} bolt-${moving.weapon} side-${side}`} style={{ '--to': `${moving.bolt}px`, animationDelay: `${moving.dur * 0.45}ms`, animationDuration: `${300 * speed.current}ms` }} />}
        <div className="spot-pops">{pops.filter((p) => p.side === side && p.lane === lane).map((p) => <span key={p.id} className={`pop pop-${p.kind}`}>{p.text}{p.why && <small>{p.why}</small>}</span>)}</div>
      </div>
    )
  }

  const Hud = ({ side }) => {
    const L = disp[side].leader
    const pct = Math.max(0, L) / LEADER_HP
    return (
      <div className={`hud-side hud-${side} ${hurt?.key === `${side}:leader` ? 'hit' : ''}`}>
        <Avatar seed={side === 'you' ? 'player:' + snap.player.name : r.id} pic={side === 'you' ? playerPic(snap.player) : null} size={38} ring={side === 'you' ? 'var(--accent)' : tierColor(r.level)} />
        <div className="hud-main">
          <div className="hud-name">{side === 'you' ? snap.player.name : <>{r.name} <span className="ld-lv"><Crest lvl={r.level} size={12} /> {r.level}</span></>}</div>
          <div className="hud-bar"><i style={{ width: `${pct * 100}%` }} className={pct < 0.35 ? 'low' : ''} /><span className="mono">{Math.max(0, L)}/{LEADER_HP}</span></div>
          <div className="hud-sub mono">{(disp[side].deckCount ?? b[side].deckCount) > 0 ? `${side === 'them' ? `✋${b.them.handCount} · ` : ''}▤${disp[side].deckCount ?? b[side].deckCount}` : `hand ${side === 'them' ? b.them.handCount : b.you.hand.length}${b[side].out?.length ? ` · ✖${b[side].out.length}` : ''}`}</div>
        </div>
        <div className="ld-pops">{pops.filter((p) => p.side === side && p.lane === 'leader').map((p) => <span key={p.id} className={`pop pop-${p.kind}`}>{p.text}{p.why && <small>{p.why}</small>}</span>)}</div>
      </div>
    )
  }

  const menuUnit = menu && disp[menu.side].board[menu.lane]
  const menuAtk = menuUnit && attackOf(view, menu.side, menu.lane)
  const md = menuUnit && resolve(menuUnit.ref)

  return (
    <div className={`duel theme-${league} map-${b.map || 'plains'} ${MAP_ART[b.map] ? 'painted' : ''}`} role="dialog" aria-modal="true" aria-label={`Duel against ${r.name}`}>
      <div className={`hud ${hl('hp')}`}>
        <Hud side="you" />
        <div className="hud-mid mono"><b>VS</b><span>T{b.you.turns}/{TURN_LIMIT}</span></div>
        <Hud side="them" />
      </div>

      <div className="stage" ref={stageRef} onClick={() => { if (busy) speed.current = 0.45 }}>
        <div ref={worldRef} className={`world ${cam != null ? 'cam' : ''}`} style={cam != null ? { transform: `scale(${1.42 - ROWS[cam].s * 0.32}) translateY(${(62 - ROWS[cam].y) * 0.6}%)` } : undefined}>
          <div className="sky" aria-hidden="true"><div className="sun" /><div className="hills far" /><div className="hills near" /></div>
          <div className="ground" aria-hidden="true"><div className="floor" /></div>
          <div className="scenery" aria-hidden="true" />
          {MAP_ART[b.map] ? <MapBackdrop map={b.map} /> : <Props map={b.map || 'plains'} />}
          {Array.from({ length: LANES }, (_, lane) => {
            const el = EL[b.terrain[lane]]
            const row = ROWS[lane]
            return (
              <div key={'band' + lane} className="band" style={{ top: `${row.y}%`, '--ec': el.color, '--s': row.s, zIndex: 1 + lane * 2 }} aria-hidden="true">
                <div className={`terr ${hl('terrain')}`} title={`${el.name} lane: ${el.name} fighters hit +2 harder here`}><span>{el.glyph}</span><b>{el.name.toUpperCase()} +2</b></div>
              </div>
            )
          })}
          {Array.from({ length: LANES }, (_, lane) => [renderSpot('you', lane), renderSpot('them', lane)])}
          {spark?.leader && <span key={spark.key} className={`edge-hit edge-${spark.side}`} />}
          {flash && <span key={flash} className="screen-flash" aria-hidden="true" />}
          {spark && (() => { const row = ROWS[spark.lane]; return (
            <div className="fx-anchor" style={{ left: `${row.x[spark.side === 'you' ? 0 : 1]}%`, top: `${row.y}%`, '--s': row.s }}>
              <Impact key={spark.key} seed={spark.key} el={spark.blocked ? 'block' : spark.el} big={spark.big} dir={spark.from === 'you' ? 1 : -1} />
            </div>) })()}
        </div>
        {banner && <div className={`turn-banner b-${banner}`}>{{ start: 'DUEL START', you: 'YOUR TURN', them: `${r.name.toUpperCase()}'S TURN`, youatk: 'YOUR FIGHTERS ATTACK!', themattack: `${r.name.toUpperCase()} ATTACKS!` }[banner]}</div>}
        <div className="side-tag you">YOU</div><div className="side-tag them">{r.name.toUpperCase()}</div>
        <button className="guide-btn" onClick={(ev) => { ev.stopPropagation(); play('click'); setGuide(true) }} aria-label="How to play">?</button>
        {busy && b.turn !== 'you' && !fx && <div className="thinking mono">{r.name} is thinking…</div>}
        {busy && fx?.t === 'attack' && <div className="speed-hint mono">tap to speed up</div>}
      </div>

      <div className="feed-line" aria-live="polite">{feed.slice(0, 1).map((l) => <div key={l}>{l}</div>)}</div>

      <div className="dock">
        <div className={`energy ${hl('energy')}`} aria-label={`Energy ${energy} of ${disp.you.maxEnergy ?? b.you.maxEnergy}`}>
          {Array.from({ length: MAX_ENERGY }, (_, k) => <i key={k} className={k < energy ? 'on' : k < (disp.you.maxEnergy ?? b.you.maxEnergy) ? 'spent' : ''} />)}
          <span className="mono">{energy}/{disp.you.maxEnergy ?? b.you.maxEnergy}</span>
        </div>
        <div className="dock-mid mono">
          <div className="dock-pot">{b.wager.type === 'coins' && b.wager.amount > 0 ? `POT ${fmt(b.wager.amount * 2)}` : b.wager.type === 'card' ? 'CARD BET' : 'FRIENDLY'}</div>
          {!tutorial && <button className="duel-quit" onClick={forfeit} disabled={b.status !== 'active' || busy}>FORFEIT</button>}
        </div>
        <button className={`end-turn ${step === 3 ? 'ready' : ''} ${hl('end')}`} onClick={endTurn} disabled={!myTurn}>END TURN<small>fighters attack</small></button>
      </div>

      <Coach step={step} selCard={selCard} energy={energy} rivalName={r.name} shift={shiftFrom != null} swap={swapFrom != null} name={selCard ? resolve(selCard.ref)?.card.name : ''} over={b.status !== 'active'} />

      {b.you.out?.length > 0 && (
        <div className="destroyed-row" aria-label={`${b.you.out.length} of your cards destroyed this match`}>
          <span className="label">DESTROYED · {b.you.out.length}</span>
          {b.you.out.map((c) => { const d = resolve(c.ref); return d && <span key={c.id} className="dz-card" title={`${d.card.name} — out until your next match`}><CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} /><i>✖</i></span> })}
        </div>
      )}
      {b.you.deckCount === 0 && b.status === 'active' && <div className={`bench-label ${swapFrom != null ? 'swapping' : ''}`}>{swapFrom != null ? <>Pick a bench card to swap into the {laneWord(swapFrom)} lane · <button className="link" onClick={() => setSwapFrom(null)}>cancel</button></> : `YOUR HAND · ${b.you.hand.length}`}</div>}
      <div className={`hand3d ${swapFrom != null ? 'swapping' : ''}`} style={{ '--n': Math.max(4, b.you.hand.length) }}>
        {b.you.hand.map((c, i) => {
          const d = resolve(c.ref)
          const n = b.you.hand.length, off = i - (n - 1) / 2
          const affordable = c.unit.cost <= energy
          return d && (
            <button key={c.id} className={`hcard ${sel === i ? 'sel' : ''} ${affordable && myTurn ? 'ok' : 'no'} ${tcur?.hl === 'hand0' && i === 0 ? 'tut-hl' : ''}`} style={{ '--r': `${off * 5}deg`, '--y': `${Math.abs(off) * 6}px` }}
              onClick={() => {
                if (tLocked && !((tcur.wait === 'select' || tcur.wait === 'play') && tcur.allowSelect?.(i))) return nudgeIt()
                if (swapFrom != null) {
                  if (energy < TACTIC_COST) { play('error'); toast(`A swap costs ${TACTIC_COST} energy`, 'error'); return }
                  play('click'); return act((s) => s.useTactic(b.id, 'swap', swapFrom, i))
                }
                play('click'); setMenu(null); setShiftFrom(null); setSel(sel === i ? null : i)
                if (tcur?.wait === 'select') advance()
              }}
              aria-label={`${d.card.name}: level ${c.unit.level ?? 1}, costs ${c.unit.cost}, attack ${c.unit.atk}, health ${c.unit.hp}`}>
              <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} stats={c.unit} level={null} />
              <span className="hc-cost">{c.unit.cost}</span>
              {c.unit.level != null && <span className={`hc-lv lv-t${levelTier(c.unit.level)}`}>LV{c.unit.level}</span>}
            </button>
          )
        })}
        {!b.you.hand.length && <span className="fine">No cards in hand</span>}
      </div>

      {menu && menuUnit && md && (
        <div className="sheet-back" onClick={() => setMenu(null)}>
          <div className="sheet unit-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${md.card.name} details`}>
            <div className="sheet-card"><CardFrame card={md.card} rarity={md.rarity} frame={md.frame} footRight={md.footRight} size="sm" tilt={false} showCount={false} level={menuUnit.level} /></div>
            <div className="sheet-info">
              <h3>{md.card.name} <span className="cpu-tag">{menu.side === 'you' ? 'YOUR FIGHTER' : `${r.name}'s FIGHTER`} · {LANE_NAMES[menu.lane]} LANE</span></h3>
              <p className="fine">{menuUnit.level != null ? `Level ${menuUnit.level} · ` : ''}{OUTFIT_NAMES[loadoutOf(menuUnit).outfit]} · {WEAPON_NAMES[weaponFor(menuUnit)]}</p>
              <StatTiles stats={menuUnit} />
              <Abilities list={menuUnit.abilities} />
              {menuAtk && (
                <div className="atk-preview">
                  <div className="label">WHEN {menu.side === 'you' ? 'YOU END YOUR TURN' : `${r.name.toUpperCase()} ENDS THEIR TURN`}</div>
                  <div className="ap-parts">{menuAtk.parts.map((p) => <span key={p.k} className={`bonus ${p.v < 0 ? 'neg' : ''}`}>{p.label} {p.k === 'base' ? p.v : (p.v > 0 ? '+' : '') + p.v}</span>)}</div>
                  <p>Runs across its lane and hits {menuAtk.target === 'leader' ? <b>{menu.side === 'you' ? r.name : 'you'} directly (the lane is empty)</b> : <b>{unitName(disp[menu.side === 'you' ? 'them' : 'you'].board[menu.lane])}</b>} for <b>{menuAtk.dmg}</b>{menuAtk.blocked ? ` (${menuAtk.blocked} blocked)` : ''}.</p>
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
                  <span className="st-ic">⇢</span><span className="st-main">SHIFT ⚡{TACTIC_COST}</span><span className="st-sub">{menuUnit.shifted ? 'Already moved this turn' : 'Move it to an empty lane'}</span>
                </button>
                <button className="stance swap" disabled={tLocked || menuUnit.shifted || !b.you.hand.length || energy < TACTIC_COST} onClick={() => { play('click'); setSel(null); setSwapFrom(menu.lane); setMenu(null) }}>
                  <span className="st-ic">⇄</span><span className="st-main">SWAP ⚡{TACTIC_COST}</span><span className="st-sub">{menuUnit.shifted ? 'Already moved this turn' : 'Switch in a bench card. This one goes to the bench and keeps its damage.'}</span>
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

function FighterArt({ d, u, side, pose, move, dur, power }) {
  const art = useArtUrl(d.card)
  return <Fighter unit={u} art={art} rarity={d.rarity} side={side} pose={pose} move={move} dur={dur} power={power} />
}

// The three-step helper under the table.
function Coach({ step, selCard, energy, rivalName, shift, swap, name, over }) {
  if (step == null) return <div className="coach"><div className="coach-msg">{over ? 'The duel is over.' : ''}</div></div>
  const steps = [['1', 'PICK A CARD'], ['2', 'PLACE IT'], ['3', 'END TURN']]
  let msg
  if (step === 0) msg = `${rivalName}'s turn — watch where they place fighters.`
  else if (step === 1) msg = 'Pick a card from your hand. The blue number is its energy cost.'
  else if (shift) msg = 'Tap an empty ring on your side to move your fighter there.'
  else if (swap) msg = 'Tap a bench card below to swap it in.'
  else if (selCard && selCard.unit.cost > energy) msg = `${name} costs ${selCard.unit.cost} energy — you have ${energy}. Pick a cheaper card.`
  else msg = `Tap a glowing empty ring to send ${name} in — or tap one of your fighters to swap ${name} in for it (⚡1).`
  if (step === 3) msg = 'All set? Tap END TURN — every fighter you have runs across its lane and attacks.'
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
    ['🎯', 'The goal', 'Each side has a hero with 25 HP. You are on the left, your rival on the right. Knock their HP to 0 to win. If nobody falls after 10 turns each, the hero with more HP wins.'],
    ['⚡', 'Energy', 'At the start of each turn you get energy: 2 on your first turn, 3 on the next, up to 6. Every card shows its cost in a blue circle.'],
    ['🃏', 'Place fighters', 'The field starts empty. Your cards wait in your hand, starters first: tap one, then tap a glowing ring, and it turns into a fighter. A card costs the energy shown on it. Over each fighter: LV is its level, ⚔ is how hard it hits, the bar is its health.'],
    ['⚔', 'End turn = attack', 'Tap END TURN. Each of your fighters runs across its lane. If an enemy fighter stands across from it, it hits that fighter. If the lane is empty, it hits the rival hero directly. The number that pops up shows how the damage was added up. (Nobody attacks on the very first turn.)'],
    ['🔁', 'Their turn', 'Your rival does the same: places fighters, then attacks across the lanes. A fighter whose health runs out is knocked out.'],
    ['💡', 'How to win', 'Pick your strongest, highest-level cards before the duel. Block lanes where their strong fighters are. Attack through empty lanes to hit their hero. Each lane has an element: a fighter of that element hits +2 there. Ember ▲ beats Gale ❖, Gale beats Tide ≈, Tide beats Ember: +3 when you hit a fighter you beat.'],
    ['⇄', 'Switch on your turn', 'Tap a bench card, then tap one of your fighters to swap them (1 energy). The fighter coming off keeps its damage. If a lane is empty, tap the ring to send a bench card in for its energy cost.'],
    ['✖', 'Destroyed', 'A fighter whose health runs out is destroyed: it is out for the rest of this match and comes back for your next one.'],
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
