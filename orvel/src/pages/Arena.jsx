import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CardFrame from '../components/Card.jsx'
import Avatar, { playerPic } from '../components/Avatar.jsx'
import { Btn, Cash, Modal, RarityTag, WindowTitle } from '../components/ui.jsx'
import { useGame, fmt, server } from '../store.jsx'
import { customDisplay } from '../lib/customCard.js'
import { DECK_SIZE, LEADER_HP, MAX_ENERGY, TURN_LIMIT, ABILITIES, ELEMENTS, RECRUITS, unitOf, MAPS, STARTERS, BENCH } from '../server/battle.js'
import Table from '../components/Table.jsx'
import { makeTutorialDuel, TRAINER } from '../components/Tutorial.jsx'
import { play } from '../lib/sound.js'

// ───────────────────────── shared bits ─────────────────────────

const LEAGUES = [
  { id: 'bronze', name: 'Bronze League', min: 0, color: '#d58b4f' },
  { id: 'silver', name: 'Silver League', min: 10, color: '#c9d6e3' },
  { id: 'gold', name: 'Gold League', min: 25, color: '#ffd166' },
  { id: 'diamond', name: 'Diamond League', min: 40, color: '#7ff6ff' },
  { id: 'master', name: 'Master League', min: 55, color: '#ff5cf0' },
]
export const leagueOf = (lvl) => [...LEAGUES].reverse().find((l) => lvl >= l.min)
export const tierColor = (lvl) => leagueOf(lvl).color
const titleFor = (wins) => (wins >= 100 ? 'Legend' : wins >= 40 ? 'Champion' : wins >= 15 ? 'Challenger' : wins >= 5 ? 'Contender' : 'Rookie')
const EL = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]))
const AB = Object.fromEntries(ABILITIES.map((a) => [a.id, a]))

const RECRUIT_RARITY = { name: 'Recruit', color: '#9aa7b4', color2: '#3b4552', effect: 'matte' }
export function useResolve() {
  const { snap, rarityById } = useGame()
  return useCallback((ref) => {
    if (ref.kind === 'recruit') {
      const rc = RECRUITS.find((x) => x.id === ref.id) || RECRUITS[0]
      return { card: { id: rc.id, name: rc.name, code: 'RECRUIT', imageUrl: rc.art, collectionNumber: 0, fit: 'cover', limited: null }, rarity: RECRUIT_RARITY, footRight: 'BASIC' }
    }
    if (ref.kind === 'custom') {
      const c = snap.player.customs.find((x) => x.id === ref.id)
      return c ? customDisplay(c) : null
    }
    const card = snap.cards.find((x) => x.id === ref.id)
    return card ? { card, rarity: rarityById[card.rarityId] } : null
  }, [snap, rarityById])
}

export function Crest({ lvl, size = 22 }) {
  const l = leagueOf(lvl)
  return (
    <svg className="crest" width={size} height={size} viewBox="0 0 24 24" aria-label={l.name}>
      <path d="M12 1 L21 5 V12 C21 17 17 21 12 23 C7 21 3 17 3 12 V5 Z" fill={l.color} opacity=".95" />
      <path d="M12 4 L18 7 V12 C18 15.5 15.5 18.5 12 20 C8.5 18.5 6 15.5 6 12 V7 Z" fill="#0008" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontFamily="'Press Start 2P', monospace" fill={l.color}>{lvl}</text>
    </svg>
  )
}

// ───────────────────────── lobby ─────────────────────────

export default function Arena() {
  const { snap } = useGame()
  const [rivals, setRivals] = useState(null)
  const [profile, setProfile] = useState(null)
  const [setup, setSetup] = useState(null)
  const [battle, setBattle] = useState(null)
  const [rules, setRules] = useState(false)
  const [tut, setTut] = useState(null) // a running tutorial duel
  const [offer, setOffer] = useState(null) // rival waiting while we offer the tutorial
  const startTutorial = () => { play('open'); setOffer(null); setTut(makeTutorialDuel()) }
  // the first time someone goes to duel, offer the tutorial first
  const challenge = (r) => {
    let skipped = false
    try { skipped = sessionStorage.getItem('orvel:tutSkipped') === '1' } catch {}
    if (!snap.player.tutorialDone && !skipped) setOffer(r)
    else setSetup(r)
  }

  const loadRivals = useCallback(() => server.rivals().then(setRivals), [])
  useEffect(() => { loadRivals() }, [loadRivals, snap.player.battle])
  useEffect(() => { if (snap.activeBattleId && !battle) server.activeBattle().then((b) => b && setBattle(b)) }, [snap.activeBattleId])

  const b = snap.player.battle
  const headliner = useMemo(() => {
    if (!rivals?.length) return null
    const d = new Date().toISOString().slice(0, 10)
    let h = 0; for (const ch of d) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return rivals[h % rivals.length]
  }, [rivals])
  const recent = snap.transactions.filter((t) => t.type === 'battle').slice(0, 6)
  const winRate = b.wins + b.losses ? Math.round((b.wins / (b.wins + b.losses)) * 100) : 0

  return (
    <div className="page arena">
      <section className="arena-hero">
        <div className="ah-beams" aria-hidden="true"><i /><i /><i /></div>
        <div className="ah-floor" aria-hidden="true" />
        <div className="ah-crowd" aria-hidden="true" />
        <div className="ah-content">
          <div className="ah-kicker">ORVEL</div>
          <h1 className="ah-title">ARENA</h1>
          <p className="ah-sub">Three lanes. One table. Bet it all and win double.</p>
          <div className="ah-links">
            <button className="link ah-rules" onClick={() => { play('click'); setRules(true) }}>How duels work</button>
            <button className="link ah-rules" onClick={startTutorial}>{snap.player.tutorialDone ? 'Replay tutorial' : 'Play the tutorial (+300)'}</button>
          </div>
        </div>
        <div className="fighter window">
          <div className="fighter-av"><Avatar seed={'player:' + snap.player.name} pic={playerPic(snap.player)} size={64} ring="var(--accent)" />{b.streak >= 3 && <span className="onfire">ON FIRE</span>}</div>
          <div className="fighter-id">
            <div className="fighter-title">{titleFor(b.wins).toUpperCase()}</div>
            <div className="fighter-name">{snap.player.name}</div>
            <div className="fighter-rec mono">{b.wins}W · {b.losses}L{b.draws ? ` · ${b.draws}D` : ''} · {winRate}%</div>
          </div>
          <div className="fighter-streak"><span className="fs-n">{b.streak}</span><span className="fs-l">STREAK</span><span className="fs-b mono">best {b.best}</span></div>
        </div>
      </section>

      {snap.activeBattleId && !battle && (
        <button className="resume" onClick={() => server.activeBattle().then(setBattle)}>⚔ Duel in progress — tap to resume</button>
      )}

      {headliner && (
        <section className="headliner" style={{ '--lc': tierColor(headliner.level) }} onClick={() => setProfile(headliner.id)} role="button" tabIndex={0}>
          <div className="hl-spot" aria-hidden="true" />
          <div className="hl-label">TODAY'S HEADLINER</div>
          <div className="hl-body">
            <div className="hl-av"><Avatar seed={headliner.id} size={96} ring={tierColor(headliner.level)} /></div>
            <div className="hl-info">
              <div className="hl-name">{headliner.name} <Crest lvl={headliner.level} size={26} /></div>
              <div className="hl-quote">“{headliner.line}”</div>
              <div className="hl-stats mono">{fmt(headliner.wins)}W · {fmt(headliner.losses)}L{headliner.streak ? ` · ▲${headliner.streak} streak` : ''}</div>
              <div className="hl-btns">
                <Btn onClick={(e) => { e.stopPropagation(); challenge(headliner) }}>Challenge</Btn>
                <span className="mono muted">bets up to {fmt(headliner.betCap)}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {!rivals ? <p className="mono blink">LOADING RIVALS…</p> : LEAGUES.map((L, li) => {
        const list = rivals.filter((r) => leagueOf(r.level).id === L.id)
        if (!list.length) return null
        return (
          <section key={L.id} className="league" style={{ '--lc': L.color }}>
            <div className="league-head"><Crest lvl={L.min || 1} size={26} /><span className="league-name">{L.name.toUpperCase()}</span><span className="league-line" /></div>
            <div className="league-row">
              {list.map((r, k) => {
                const rate = r.wins / Math.max(1, r.wins + r.losses)
                return (
                  <div key={r.id} className="ftile" style={{ '--lc': tierColor(r.level), '--d': `${(li * 3 + k) * 50}ms` }} onClick={() => { play('click'); setProfile(r.id) }} role="button" tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setProfile(r.id)}>
                    <div className="ft-glow" aria-hidden="true" />
                    <div className="ft-top"><Crest lvl={r.level} /><span className="ft-lv">LV {r.level}</span>{r.streak >= 3 && <span className="ft-fire">▲{r.streak}</span>}</div>
                    <div className="ft-av"><Avatar seed={r.id} size={78} ring={tierColor(r.level)} /></div>
                    <div className="ft-name">{r.name}</div>
                    <div className="ft-bar" title={`Win rate ${Math.round(rate * 100)}%`}><i style={{ width: `${rate * 100}%` }} /></div>
                    <div className="ft-meta mono">{Math.round(rate * 100)}% · deck {r.deckPower}</div>
                    <button className="ft-vs" onClick={(e) => { e.stopPropagation(); play('click'); challenge(r) }}>VS</button>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}

      {recent.length > 0 && (
        <section className="window recent">
          <div className="panel-title">RECENT DUELS</div>
          {recent.map((t) => (
            <div key={t.id} className={`rd rd-${t.result}`}>
              <Avatar seed={t.rivalId} size={28} />
              <span className="rd-name">{t.rivalName}</span>
              <span className="rd-res">{t.result?.toUpperCase()}</span>
              <span className="mono rd-amt">{t.amount > 0 ? `+${fmt(t.amount)}` : t.amount < 0 ? fmt(t.amount) : t.wager?.type === 'card' ? 'card bet' : '—'}</span>
            </div>
          ))}
        </section>
      )}

      {rules && <Rules onClose={() => setRules(false)} />}
      {offer && (
        <Modal onClose={() => setOffer(null)} label="First duel">
          <WindowTitle onClose={() => setOffer(null)}>YOUR FIRST DUEL</WindowTitle>
          <div className="modal-body tut-offer">
            <Avatar seed={TRAINER.id} size={72} ring="var(--gold)" />
            <p><b>New to duels?</b> Play a 2-minute practice duel with Pip, who shows you each step. Nothing is bet, and finishing it pays <b>300 coins</b> the first time.</p>
            <div className="confirm-btns">
              <Btn variant="ghost" onClick={() => { try { sessionStorage.setItem('orvel:tutSkipped', '1') } catch {} ; const r = offer; setOffer(null); setSetup(r) }}>Skip, duel {offer.name}</Btn>
              <Btn onClick={startTutorial}>Play the tutorial</Btn>
            </div>
          </div>
        </Modal>
      )}
      {tut && <Table initial={tut.view()} engine={tut} tutorial onClose={() => { setTut(null); loadRivals() }} onRematch={() => setTut(null)} />}
      {profile && <RivalProfile id={profile} onClose={() => setProfile(null)} onDuel={(r) => { setProfile(null); challenge(r) }} />}
      {setup && <DuelSetup rival={setup} onClose={() => setSetup(null)} onStart={(bt) => { setSetup(null); setBattle(bt) }} />}
      {battle && <Battle initial={battle} onClose={() => { setBattle(null); loadRivals() }} onRematch={(r) => { setBattle(null); setSetup(r) }} />}
    </div>
  )
}

function Rules({ onClose }) {
  return (
    <Modal onClose={onClose} label="How duels work">
      <WindowTitle onClose={onClose}>HOW DUELS WORK</WindowTitle>
      <div className="rules">
        <p>You and your rival each have a <b>leader with {LEADER_HP} HP</b>, three <b>lanes</b>, and a deck of {DECK_SIZE} cards (Recruits fill any empty slots). Knock their leader to 0 to win. After {TURN_LIMIT} turns each, the healthier leader wins.</p>
        <div className="rules-steps">
          <div><b>1 · ENERGY</b><span>Each turn your energy refills: 2 on your first turn, one more each turn, up to {MAX_ENERGY}. You draw a card.</span></div>
          <div><b>2 · PLAY</b><span>Put cards into your empty lanes. Each card costs energy (shown on the card). On the table it becomes a unit with ATK and HP.</span></div>
          <div><b>3 · TACTICS</b><span>Tap one of your units: <b>Fortify</b> (1 energy) blocks 4 from every hit until your next turn; <b>Shift</b> (1 energy) moves it to an empty lane.</span></div>
          <div><b>4 · END TURN</b><span>Every unit you have attacks straight down its lane: the enemy unit there, or their leader if the lane is empty. Units attack the turn they're played — except the very first turn of the duel.</span></div>
        </div>
        <p><b>Terrain:</b> each lane has an element. A unit standing on its own element gets <b>+2 ATK</b>.</p>
        <p><b>Elements:</b> attacking a unit whose element yours beats gives <b>+3 ATK</b>.</p>
        <div className="rules-tri">{ELEMENTS.map((e) => <span key={e.id} style={{ color: e.color }}>{e.glyph} {e.name}</span>).reduce((a, x, i) => [...a, i ? <i key={'a' + i}>beats</i> : null, x], [])}<i>beats</i><span style={{ color: ELEMENTS[0].color }}>{ELEMENTS[0].glyph} {ELEMENTS[0].name}</span></div>
        <ul className="rules-ab">{ABILITIES.map((a) => <li key={a.id}><b>{a.name}</b> {a.text}</li>)}</ul>
        <p className="fine">Tap any card or unit on the table to see its numbers and exactly what it will hit next.</p>
      </div>
    </Modal>
  )
}

function RivalProfile({ id, onClose, onDuel }) {
  const { snap, rarityById } = useGame()
  const [p, setP] = useState(null)
  useEffect(() => { server.rivalProfile(id).then(setP) }, [id])
  const fav = p && snap.cards.find((c) => c.id === p.favoriteCardId)
  return (
    <Modal onClose={onClose} wide label="Player profile">
      <WindowTitle onClose={onClose}>PLAYER PROFILE</WindowTitle>
      {!p ? <p className="mono blink">LOADING…</p> : (
        <div className="profile-body" style={{ '--lc': tierColor(p.level) }}>
          <div className="pf-banner">
            <div className="pf-av"><Avatar seed={p.id} size={136} ring={tierColor(p.level)} /></div>
            <div className="pf-id">
              <div className="pf-name">{p.name} <span className="cpu-tag" title="Computer-controlled rival">CPU</span></div>
              <div className="pf-league"><Crest lvl={p.level} size={24} /> {leagueOf(p.level).name} · Level {p.level}</div>
              <p className="pf-bio">“{p.bio}”</p>
            </div>
          </div>
          <div className="pf-stats">
            <div className="pfs"><span className="label">STREAK</span><b>{p.streak}</b></div>
            <div className="pfs"><span className="label">RECORD</span><b>{fmt(p.wins)}–{fmt(p.losses)}</b></div>
            <div className="pfs"><span className="label">WIN RATE</span><b>{Math.round((p.wins / Math.max(1, p.wins + p.losses)) * 100)}%</b></div>
            <div className="pfs"><span className="label">CARDS</span><b>{p.totalCards}</b></div>
            <div className="pfs"><span className="label">BETS UP TO</span><Cash amount={p.betCap} /></div>
          </div>
          {fav && (
            <div className="pf-fav">
              <CardFrame card={fav} rarity={rarityById[fav.rarityId]} size="sm" showCount={false} />
              <div><div className="label">FAVORITE CARD</div><b>{fav.name}</b><br /><RarityTag rarity={rarityById[fav.rarityId]} /></div>
            </div>
          )}
          <div className="label">COLLECTION · {p.collection.length} UNIQUE</div>
          <div className="pf-grid">
            {p.collection.map((e) => {
              const card = snap.cards.find((c) => c.id === e.cardId)
              return card && <CardFrame key={e.cardId} card={card} rarity={rarityById[card.rarityId]} size="sm" count={e.count} stats={e.stats} tilt={false} />
            })}
          </div>
          <div className="confirm-btns"><Btn variant="ghost" sound="back" onClick={onClose}>Close</Btn><Btn onClick={() => onDuel(p)}>Challenge {p.name}</Btn></div>
        </div>
      )}
    </Modal>
  )
}

// ───────────────────────── duel setup ─────────────────────────

function LineupSlot({ k, label, resolve, options, onRemove, onMove, moveLabel }) {
  const o = k && options.find((x) => `${x.ref.kind}:${x.ref.id}` === k)
  const d = o && resolve(o.ref)
  if (!d) return <div className="lu-slot empty"><span>{label}</span><i>empty</i></div>
  return (
    <div className="lu-slot">
      <button className="lu-card" onClick={() => onRemove(k)} aria-label={`Remove ${d.card.name}`}><CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} stats={unitOf(o.stats)} /></button>
      <span className="lu-lane">{label}</span>
      <button className="lu-move" onClick={() => onMove(k)} aria-label={`Move ${d.card.name} ${moveLabel}`}>⇅</button>
    </div>
  )
}

const DECK_KEY = 'orvel:lastLineup'
const MAP_KEY = 'orvel:lastMap'
const LANE_LABELS = ['BACK', 'MIDDLE', 'FRONT']
function DuelSetup({ rival, onClose, onStart }) {
  const { snap, rarityById, call } = useGame()
  const resolve = useResolve()
  const [info, setInfo] = useState(null)
  const options = useMemo(() => {
    const own = snap.cards.filter((c) => snap.player.inventory[c.id]?.count > 0)
      .map((c) => ({ ref: { kind: 'card', id: c.id }, stats: snap.cardStats[c.id] }))
    const customs = snap.player.customs.map((c) => ({ ref: { kind: 'custom', id: c.id }, stats: { atk: c.atk, def: c.def, element: c.element, abilities: c.abilities } }))
    const power = (o) => (o.stats ? o.stats.atk + o.stats.def + o.stats.abilities.length * 3 : 0)
    return [...customs, ...own].filter((o) => o.stats).sort((a, b) => power(b) - power(a))
  }, [snap])
  const key = (r) => `${r.kind}:${r.id}`
  const has = (k) => options.some((o) => key(o.ref) === k)
  const strongest = () => ({ starters: options.slice(0, STARTERS).map((o) => key(o.ref)), bench: options.slice(STARTERS, STARTERS + BENCH).map((o) => key(o.ref)) })
  const [lineup, setLineup] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DECK_KEY) || 'null')
      if (saved?.starters) return { starters: saved.starters.filter(has).slice(0, STARTERS), bench: saved.bench.filter(has).slice(0, BENCH) }
    } catch {}
    return strongest()
  })
  const [addTo, setAddTo] = useState('starters')
  const [map, setMap] = useState(() => { try { const m = localStorage.getItem(MAP_KEY); if (MAPS.some((x) => x.id === m)) return m } catch {} return 'city' })
  const deck = [...lineup.starters, ...lineup.bench]
  const recruitsNeeded = STARTERS + BENCH - deck.length
  const [mode, setMode] = useState('coins')
  const [amount, setAmount] = useState(Math.min(rival.betCap, 100, snap.player.cash))
  const [betCard, setBetCard] = useState('')
  const [stake, setStake] = useState(null)
  const [busy, setBusy] = useState(false)

  const wager = mode === 'free' ? { type: 'coins', amount: 0 } : mode === 'coins' ? { type: 'coins', amount: Number(amount) || 0 } : betCard ? { type: 'card', cardId: betCard } : null
  const betCards = useMemo(() => snap.cards.filter((c) => {
    const n = snap.player.inventory[c.id]?.count || 0
    const inDeck = deck.includes(`card:${c.id}`)
    const v = c.sellValue ?? rarityById[c.rarityId]?.sellValue
    return n > (inDeck ? 1 : 0) && v <= rival.cardCap
  }), [snap, deck, rival, rarityById])

  useEffect(() => {
    setStake(null)
    if (!wager || (wager.type === 'coins' && !wager.amount)) return
    let live = true
    server.battleQuote(rival.id, wager).then((q) => live && setStake(q.stake)).catch(() => {})
    return () => { live = false }
  }, [mode, amount, betCard])

  // tap a card: in → out; out → into starters or bench (whichever you chose, or
  // whichever still has room)
  const toggle = (k) => {
    play('hover')
    setLineup((L) => {
      if (L.starters.includes(k)) return { ...L, starters: L.starters.filter((x) => x !== k) }
      if (L.bench.includes(k)) return { ...L, bench: L.bench.filter((x) => x !== k) }
      const toStart = (addTo === 'starters' && L.starters.length < STARTERS) || L.bench.length >= BENCH
      if (toStart && L.starters.length < STARTERS) return { ...L, starters: [...L.starters, k] }
      if (L.bench.length < BENCH) return { ...L, bench: [...L.bench, k] }
      return L
    })
  }
  // move a picked card between the field and the bench
  const flip = (k) => {
    play('hover')
    setLineup((L) => {
      if (L.starters.includes(k) && L.bench.length < BENCH) return { starters: L.starters.filter((x) => x !== k), bench: [...L.bench, k] }
      if (L.bench.includes(k) && L.starters.length < STARTERS) return { bench: L.bench.filter((x) => x !== k), starters: [...L.starters, k] }
      return L
    })
  }
  async function start() {
    setBusy(true)
    try {
      const ref = (k) => { const [kind, ...rest] = k.split(':'); return { kind, id: rest.join(':') } }
      const bt = await call((s) => s.startBattle({ rivalId: rival.id, starters: lineup.starters.map(ref), bench: lineup.bench.map(ref), wager, map }))
      try { localStorage.setItem(DECK_KEY, JSON.stringify(lineup)); localStorage.setItem(MAP_KEY, map) } catch {}
      play('open')
      onStart(bt)
    } catch {} finally { setBusy(false) }
  }
  const stakeCard = stake?.type === 'card' && snap.cards.find((c) => c.id === stake.cardId)
  const ready = wager && (wager.type !== 'card' || betCard)
  const deckPower = deck.reduce((t, k) => { const o = options.find((x) => key(x.ref) === k); return t + (o ? o.stats.atk + o.stats.def + o.stats.abilities.length * 3 : 0) }, 0)

  return (
    <Modal onClose={onClose} wide label="Duel setup">
      <WindowTitle onClose={onClose}>DUEL SETUP</WindowTitle>
      <div className="duel-setup">
        <div className="ds-vs" style={{ '--lc': tierColor(rival.level) }}>
          <div className="ds-side"><Avatar seed={'player:' + snap.player.name} pic={playerPic(snap.player)} size={56} ring="var(--accent)" /><b>{snap.player.name}</b><span className="mono muted">deck {deckPower}</span></div>
          <span className="ds-vs-x">VS</span>
          <div className="ds-side"><Avatar seed={rival.id} size={56} ring={tierColor(rival.level)} /><b>{rival.name}</b><span className="mono muted">deck {rival.deckPower}</span></div>
        </div>

        <section>
          <div className="ds-head"><span className="label">CHOOSE A MAP</span><span className="fine">{MAPS.find((x) => x.id === map)?.blurb}</span></div>
          <div className="map-row" role="radiogroup" aria-label="Map">
            {MAPS.map((m) => (
              <button key={m.id} role="radio" aria-checked={map === m.id} className={`map-tile map-${m.id} ${map === m.id ? 'on' : ''}`} onClick={() => { play('hover'); setMap(m.id) }}>
                <span className="mt-scene" aria-hidden="true"><i className="mt-hills" /><i className="mt-deco scenery" /></span>
                <b>{m.name}</b>
                {m.element && <span className="mt-el" style={{ color: ELEMENTS.find((e) => e.id === m.element)?.color }}>{ELEMENTS.find((e) => e.id === m.element)?.glyph} {m.element.toUpperCase()} LANES</span>}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="ds-head"><span className="label">YOUR LINEUP · {deck.length}/{STARTERS + BENCH}</span>
            <span className="ds-links"><button className="link" onClick={() => { play('click'); setLineup(strongest()) }}>Auto-pick strongest</button> <button className="link" onClick={() => { play('click'); setLineup({ starters: [], bench: [] }) }}>Clear</button></span></div>
          <div className="lu-zone">
            <div className="lu-title"><b>STARTERS</b><span className="fine">On the field when the duel begins</span></div>
            <div className="lu-slots three">
              {Array.from({ length: STARTERS }, (_, i) => <LineupSlot key={i} k={lineup.starters[i]} label={LANE_LABELS[i]} resolve={resolve} options={options} onRemove={toggle} onMove={flip} moveLabel="to bench" />)}
            </div>
          </div>
          <div className="lu-zone bench">
            <div className="lu-title"><b>BENCH</b><span className="fine">In your hand: send them into empty lanes, or swap one in for a fighter on the field</span></div>
            <div className="lu-slots six">
              {Array.from({ length: BENCH }, (_, i) => <LineupSlot key={i} k={lineup.bench[i]} label={`#${i + 1}`} resolve={resolve} options={options} onRemove={toggle} onMove={flip} moveLabel="to field" />)}
            </div>
          </div>
          {recruitsNeeded > 0 && <p className="fine">{recruitsNeeded} empty {recruitsNeeded === 1 ? 'spot is' : 'spots are'} filled with basic Recruits.</p>}
          <div className="ds-head lu-pickhead">
            <span className="label">YOUR CARDS</span>
            <div className="seg small">{[['starters', 'Add to starters'], ['bench', 'Add to bench']].map(([v, l]) => <button key={v} className={addTo === v ? 'on' : ''} onClick={() => { play('hover'); setAddTo(v) }}>{l}</button>)}</div>
          </div>
          {options.length === 0 ? (
            <p className="warn">You don't own any cards yet — you'll fight with Recruits. Open packs in the shop to build a real lineup.</p>
          ) : (
            <div className="ds-cards">
              {options.map((o) => {
                const k = key(o.ref), d = resolve(o.ref)
                const where = lineup.starters.includes(k) ? 'S' : lineup.bench.includes(k) ? 'B' : null
                return d && (
                  <div key={k} className={`ds-card ${where ? 'on' : ''}`}>
                    <button className="ds-pick" onClick={() => toggle(k)} aria-pressed={!!where} aria-label={`${where ? 'Remove' : 'Add'} ${d.card.name}`}>
                      <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="sm" tilt={false} showCount={false} stats={unitOf(o.stats)} />
                    </button>
                    {where && <span className={`ds-check ${where === 'S' ? 'st' : 'bn'}`}>{where === 'S' ? 'START' : 'BENCH'}</span>}
                    <button className="ds-info" onClick={() => { play('click'); setInfo({ ...o, d }) }} aria-label={`Details for ${d.card.name}`}>i</button>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section className="ds-bet">
          <span className="label">BET</span>
          <div className="seg">
            {[['free', 'Friendly'], ['coins', 'Coins'], ['card', 'A card']].map(([v, l]) => <button key={v} className={mode === v ? 'on' : ''} onClick={() => { play('hover'); setMode(v) }}>{l}</button>)}
          </div>
          {mode === 'coins' && (
            <div className="ds-amount">
              <input type="range" min="0" max={Math.max(0, Math.min(rival.betCap, snap.player.cash))} step="10" value={amount} onChange={(e) => setAmount(Number(e.target.value))} aria-label="Bet amount" />
              <Cash amount={amount} big />
              <span className="fine">{rival.name} bets up to {fmt(rival.betCap)}</span>
            </div>
          )}
          {mode === 'card' && (
            <select value={betCard} onChange={(e) => setBetCard(e.target.value)} aria-label="Card to bet">
              <option value="">Choose a card to bet…</option>
              {betCards.map((c) => <option key={c.id} value={c.id}>{c.name} · {rarityById[c.rarityId]?.name} · {fmt(c.sellValue ?? rarityById[c.rarityId]?.sellValue)}</option>)}
            </select>
          )}
          {mode === 'free' && <p className="fine">No bet. Wins still count toward your streak and rank.</p>}
          {stake && (
            <div className="ds-stake">
              <span className="label">{rival.name.toUpperCase()} PUTS UP</span>
              {stake.type === 'coins' ? <Cash amount={stake.amount} big /> : stakeCard && (
                <div className="ds-stake-card"><CardFrame card={stakeCard} rarity={rarityById[stakeCard.rarityId]} size="xs" tilt={false} showCount={false} /><div><b>{stakeCard.name}</b><br /><Cash amount={stake.value} /></div></div>
              )}
              <span className="fine">Win: keep your bet and take theirs — double. Lose: {stake.type === 'coins' ? 'your coins go to them' : 'your card joins their collection'}. Draw: both bets come back.</span>
            </div>
          )}
        </section>
        <div className="confirm-btns">
          <Btn variant="ghost" sound="back" onClick={onClose}>Cancel</Btn>
          <Btn disabled={!ready || busy} onClick={start}>⚔ Start duel</Btn>
        </div>
      </div>
      {info && <CardInfo item={info} onClose={() => setInfo(null)} />}
    </Modal>
  )
}

// Stats pop-up for a card outside a duel.
function CardInfo({ item, onClose }) {
  const s = item.stats
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${item.d.card.name} stats`}>
        <div className="sheet-card"><CardFrame card={item.d.card} rarity={item.d.rarity} frame={item.d.frame} footRight={item.d.footRight} size="sm" tilt={false} showCount={false} /></div>
        <div className="sheet-info">
          <h3>{item.d.card.name}</h3>
          <StatTiles stats={s} />
          <Abilities list={s.abilities} />
          <Btn variant="ghost" size="sm" sound="back" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  )
}
export function StatTiles({ stats }) {
  const e = EL[stats.element]
  const u = stats.hp != null ? stats : unitOf(stats)
  return (
    <div className="stat-tiles four">
      <div className="stt cost"><span>COST</span><b>{u.cost}</b><i>energy to play</i></div>
      <div className="stt atk"><span>ATK</span><b>{u.atk}</b><i>damage per attack</i></div>
      <div className="stt def"><span>HP</span><b>{u.hp}</b><i>health on the table</i></div>
      <div className="stt el" style={{ '--ec': e?.color }}><span>ELEMENT</span><b>{e?.glyph}</b><i>{e?.name} · beats {EL[e?.beats]?.name}</i></div>
    </div>
  )
}
export function Abilities({ list }) {
  if (!list?.length) return <p className="fine">No special ability.</p>
  return <ul className="ab-list">{list.map((a) => <li key={a}><b>{AB[a]?.name}</b> {AB[a]?.text}</li>)}</ul>
}

const Battle = Table

export function Result({ b, onClose, onRematch }) {
  const { snap, rarityById } = useGame()
  const won = b.status === 'won', lost = b.status === 'lost'
  const cards = (b.payout?.cards || []).map((c) => ({ ...c, card: snap.cards.find((x) => x.id === c.cardId) })).filter((c) => c.card)
  return (
    <div className={`bt-result ${b.status}`}>
      {won && <div className="confetti" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>}
      <div className="br-title">{won ? 'VICTORY' : lost ? 'DEFEAT' : 'DRAW'}</div>
      <div className="br-vs">
        <div><Avatar seed={'player:' + snap.player.name} pic={playerPic(snap.player)} size={48} ring="var(--accent)" /><span className="mono">{Math.max(0, b.you.leader)} HP</span></div>
        <span className="mono">vs</span>
        <div><Avatar seed={b.rival.id} size={48} ring={tierColor(b.rival.level)} /><span className="mono">{Math.max(0, b.them.leader)} HP</span></div>
      </div>
      {won && b.wager.type === 'coins' && b.wager.amount > 0 && <div className="br-pay">+<Cash amount={b.payout.coins} big /></div>}
      {won && cards.length > 0 && (
        <div className="br-cards">{cards.map((c, i) => (
          <div key={i} className="br-card"><CardFrame card={c.card} rarity={rarityById[c.card.rarityId]} size="sm" showCount={false} /><span className="fine">{c.returned ? 'Your card back' : c.isNew ? 'NEW — won from ' + b.rival.name : 'Won from ' + b.rival.name}</span></div>
        ))}</div>
      )}
      {lost && b.wager.type === 'coins' && b.wager.amount > 0 && <p>{b.rival.name} takes {fmt(b.wager.amount)} coins.</p>}
      {lost && b.wager.type === 'card' && <p>{b.wager.cardName} joins {b.rival.name}'s collection.</p>}
      {b.status === 'draw' && <p>Bets returned.</p>}
      <div className="mono muted">Streak {snap.player.battle.streak} · best {snap.player.battle.best}</div>
      <div className="op-sum-btns">
        <Btn onClick={onRematch}>Rematch</Btn>
        <Btn variant="ghost" sound="back" onClick={onClose}>Back to arena</Btn>
      </div>
    </div>
  )
}
