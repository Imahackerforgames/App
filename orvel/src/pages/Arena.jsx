import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CardFrame from '../components/Card.jsx'
import Avatar from '../components/Avatar.jsx'
import { Btn, Cash, Modal, RarityTag, WindowTitle } from '../components/ui.jsx'
import { useGame, fmt, server } from '../store.jsx'
import { customDisplay } from '../lib/customCard.js'
import { DECK_SIZE, MAX_HP, GUARD_CAP, ABILITIES, ELEMENTS, previewMove, applyPlay } from '../server/battle.js'
import { play } from '../lib/sound.js'

// ───────────────────────── shared bits ─────────────────────────

const LEAGUES = [
  { id: 'bronze', name: 'Bronze League', min: 0, color: '#d58b4f' },
  { id: 'silver', name: 'Silver League', min: 10, color: '#c9d6e3' },
  { id: 'gold', name: 'Gold League', min: 25, color: '#ffd166' },
  { id: 'diamond', name: 'Diamond League', min: 40, color: '#7ff6ff' },
  { id: 'master', name: 'Master League', min: 55, color: '#ff5cf0' },
]
const leagueOf = (lvl) => [...LEAGUES].reverse().find((l) => lvl >= l.min)
const tierColor = (lvl) => leagueOf(lvl).color
const titleFor = (wins) => (wins >= 100 ? 'Legend' : wins >= 40 ? 'Champion' : wins >= 15 ? 'Challenger' : wins >= 5 ? 'Contender' : 'Rookie')
const EL = Object.fromEntries(ELEMENTS.map((e) => [e.id, e]))
const AB = Object.fromEntries(ABILITIES.map((a) => [a.id, a]))

function useResolve() {
  const { snap, rarityById } = useGame()
  return useCallback((ref) => {
    if (ref.kind === 'custom') {
      const c = snap.player.customs.find((x) => x.id === ref.id)
      return c ? customDisplay(c) : null
    }
    const card = snap.cards.find((x) => x.id === ref.id)
    return card ? { card, rarity: rarityById[card.rarityId] } : null
  }, [snap, rarityById])
}

function Crest({ lvl, size = 22 }) {
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
          <p className="ah-sub">Strike. Guard. Read their hand. Win double.</p>
          <button className="link ah-rules" onClick={() => { play('click'); setRules(true) }}>How duels work</button>
        </div>
        <div className="fighter window">
          <div className="fighter-av"><Avatar seed={'player:' + snap.player.name} size={64} ring="var(--accent)" />{b.streak >= 3 && <span className="onfire">ON FIRE</span>}</div>
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
                <Btn onClick={(e) => { e.stopPropagation(); setSetup(headliner) }}>Challenge</Btn>
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
                    <button className="ft-vs" onClick={(e) => { e.stopPropagation(); play('click'); setSetup(r) }}>VS</button>
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
      {profile && <RivalProfile id={profile} onClose={() => setProfile(null)} onDuel={(r) => { setProfile(null); setSetup(r) }} />}
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
        <p>Both players have <b>{MAX_HP} HP</b> and five cards, face up. You go first, then you take turns. When both hands are empty, more HP wins — or knock them to 0 first.</p>
        <div className="rules-stances">
          <div><b className="st-strike">⚔ STRIKE</b><span>Deal the card's ATK as damage. Their guard soaks it up first.</span></div>
          <div><b className="st-guard">⛨ GUARD</b><span>Add the card's DEF to your guard (max {GUARD_CAP}). It stays until it's broken.</span></div>
        </div>
        <p><b>The pile matters.</b> The last card played sits on top. Play the <b>same element</b> for +2, or the element that <b>beats it</b> for +3 — to ATK when striking, DEF when guarding.</p>
        <div className="rules-tri">{ELEMENTS.map((e) => <span key={e.id} style={{ color: e.color }}>{e.glyph} {e.name}</span>).reduce((a, x, i) => [...a, i ? <i key={'a' + i}>beats</i> : null, x], [])}<i>beats</i><span style={{ color: ELEMENTS[0].color }}>{ELEMENTS[0].glyph} {ELEMENTS[0].name}</span></div>
        <ul className="rules-ab">{ABILITIES.map((a) => <li key={a.id}><b>{a.name}</b> {a.text}</li>)}</ul>
        <p className="fine">Tap any card in a duel to see exactly what Strike and Guard would do right now, and how hard they can hit back.</p>
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
            <div className="pf-av"><Avatar seed={p.id} size={104} ring={tierColor(p.level)} /></div>
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

const DECK_KEY = 'orvel:lastDeck'
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
  const [deck, setDeck] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem(DECK_KEY) || '[]'); const ok = saved.filter((k) => options.some((o) => key(o.ref) === k)); if (ok.length === DECK_SIZE) return ok } catch {}
    return options.slice(0, DECK_SIZE).map((o) => key(o.ref))
  })
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

  const toggle = (k) => { play('hover'); setDeck((d) => (d.includes(k) ? d.filter((x) => x !== k) : d.length < DECK_SIZE ? [...d, k] : d)) }
  async function start() {
    setBusy(true)
    try {
      const refs = deck.map((k) => { const [kind, ...rest] = k.split(':'); return { kind, id: rest.join(':') } })
      const bt = await call((s) => s.startBattle({ rivalId: rival.id, deck: refs, wager }))
      try { localStorage.setItem(DECK_KEY, JSON.stringify(deck)) } catch {}
      play('open')
      onStart(bt)
    } catch {} finally { setBusy(false) }
  }
  const stakeCard = stake?.type === 'card' && snap.cards.find((c) => c.id === stake.cardId)
  const ready = deck.length === DECK_SIZE && wager && (wager.type !== 'card' || betCard)
  const deckPower = deck.reduce((t, k) => { const o = options.find((x) => key(x.ref) === k); return t + (o ? o.stats.atk + o.stats.def + o.stats.abilities.length * 3 : 0) }, 0)

  return (
    <Modal onClose={onClose} wide label="Duel setup">
      <WindowTitle onClose={onClose}>DUEL SETUP</WindowTitle>
      <div className="duel-setup">
        <div className="ds-vs" style={{ '--lc': tierColor(rival.level) }}>
          <div className="ds-side"><Avatar seed={'player:' + snap.player.name} size={56} ring="var(--accent)" /><b>{snap.player.name}</b><span className="mono muted">deck {deckPower}</span></div>
          <span className="ds-vs-x">VS</span>
          <div className="ds-side"><Avatar seed={rival.id} size={56} ring={tierColor(rival.level)} /><b>{rival.name}</b><span className="mono muted">deck {rival.deckPower}</span></div>
        </div>

        <section>
          <div className="ds-head"><span className="label">YOUR DECK · {deck.length}/{DECK_SIZE}</span>
            <button className="link" onClick={() => setDeck(options.slice(0, DECK_SIZE).map((o) => key(o.ref)))}>Auto-pick strongest</button></div>
          {options.length < DECK_SIZE ? (
            <p className="warn">You need at least {DECK_SIZE} cards. Open packs in the shop or forge your own card.</p>
          ) : (
            <div className="ds-cards">
              {options.map((o) => {
                const k = key(o.ref), d = resolve(o.ref), on = deck.includes(k)
                return d && (
                  <div key={k} className={`ds-card ${on ? 'on' : ''}`}>
                    <button className="ds-pick" onClick={() => toggle(k)} aria-pressed={on} aria-label={`${on ? 'Remove' : 'Add'} ${d.card.name}`}>
                      <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="sm" tilt={false} showCount={false} stats={o.stats} />
                    </button>
                    {on && <span className="ds-check">{deck.indexOf(k) + 1}</span>}
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
  return (
    <div className="stat-tiles">
      <div className="stt atk"><span>ATK</span><b>{stats.atk}</b><i>damage on Strike</i></div>
      <div className="stt def"><span>DEF</span><b>{stats.def}</b><i>guard on Guard</i></div>
      <div className="stt el" style={{ '--ec': e?.color }}><span>ELEMENT</span><b>{e?.glyph}</b><i>{e?.name} · beats {EL[e?.beats]?.name}</i></div>
    </div>
  )
}
function Abilities({ list }) {
  if (!list?.length) return <p className="fine">No special ability.</p>
  return <ul className="ab-list">{list.map((a) => <li key={a}><b>{AB[a]?.name}</b> {AB[a]?.text}</li>)}</ul>
}

// ───────────────────────── the duel ─────────────────────────

const CHAT = {
  hurt: ['ugh', 'ok nice', 'wait what', 'hm.', 'lucky'],
  hit: ['gotcha', ':)', 'too easy?', 'yes!!', 'called it'],
  guard: ['not today', 'nope', 'try again'],
}
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function Battle({ initial, onClose, onRematch }) {
  const { call } = useGame()
  const resolve = useResolve()
  const [b, setB] = useState(initial)
  const [shown, setShown] = useState(initial.log.length) // log entries already animated
  const [sheet, setSheet] = useState(null) // { side, idx }
  const [busy, setBusy] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [fx, setFx] = useState(null) // the entry being animated
  const [pops, setPops] = useState([])
  const [chat, setChat] = useState(initial.rival.line)
  const [banner, setBanner] = useState(initial.log.length ? null : 'start')
  const [showResult, setShowResult] = useState(initial.status !== 'active')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])
  useEffect(() => { const p = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = p } }, [])
  useEffect(() => { if (!chat) return; const t = setTimeout(() => setChat(null), 2600); return () => clearTimeout(t) }, [chat])
  useEffect(() => { if (!banner) return; const t = setTimeout(() => setBanner(null), 1300); return () => clearTimeout(t) }, [banner])

  // What is on screen: the state after the last animated entry.
  const base = { hp: MAX_HP, guard: 0, rally: 0, hex: 0, burn: 0, counter: false }
  const view = shown ? b.log[shown - 1].after : { you: base, them: base }
  const usedSet = useMemo(() => new Set(b.log.slice(0, shown).map((e) => `${e.side}:${e.idx}`)), [b.log, shown])
  const pile = b.log.slice(0, shown).slice(-3)
  const myTurn = !busy && shown === b.log.length && b.status === 'active' && b.turn === 'you'
  const r = b.rival

  function pop(side, text, kind) {
    const id = Math.random()
    setPops((p) => [...p, { id, side, text, kind }])
    setTimeout(() => alive.current && setPops((p) => p.filter((x) => x.id !== id)), 1300)
  }

  async function animate(entries, final) {
    for (const e of entries) {
      if (!alive.current) return
      if (e.side === 'them') { setThinking(true); await sleep(700 + Math.random() * 600); setThinking(false) }
      setFx(e)
      play('flip')
      await sleep(380)
      const target = e.side === 'you' ? 'them' : 'you'
      if (e.burned) pop(e.side, `BURN −${e.burned}`, 'burn')
      if (e.stance === 'strike') {
        play('hit', e.dmg >= 8)
        if (e.absorbed) pop(target, `⛨ −${e.absorbed}`, 'block')
        pop(target, e.dmg ? `−${e.dmg}` : 'BLOCKED', e.dmg ? 'dmg' : 'block')
        if (e.heal) pop(e.side, `+${e.heal}`, 'heal')
        if (e.reflect) pop(e.side, `−${e.reflect}`, 'dmg')
        if (e.side === 'you' && Math.random() < 0.5) setChat(pick(e.dmg ? CHAT.hurt : CHAT.guard))
        if (e.side === 'them' && e.dmg && Math.random() < 0.5) setChat(pick(CHAT.hit))
      } else {
        play('guard')
        pop(e.side, `⛨ +${e.guardGain}`, 'guard')
      }
      setShown((n) => n + 1)
      await sleep(e.stance === 'strike' && e.dmg >= 8 ? 900 : 650)
      setFx(null)
    }
    if (final.status === 'active') { setBanner('you'); play('turn') }
    else { await sleep(500); setShowResult(true); play(final.status === 'won' ? 'cash' : 'back') }
  }

  async function act(idx, stance) {
    setSheet(null)
    if (!myTurn) return
    setBusy(true)
    try {
      const before = b.log.length
      const nb = await call((s) => s.playRound(b.id, idx, stance))
      setB(nb)
      await animate(nb.log.slice(before), nb)
    } catch {} finally { if (alive.current) setBusy(false) }
  }
  async function forfeit() {
    try { const nb = await call((s) => s.forfeit(b.id)); setB(nb); setShown(nb.log.length); setShowResult(true) } catch {}
  }

  const Status = ({ side }) => {
    const st = view[side]
    const hpPct = Math.max(0, st.hp) / MAX_HP
    return (
      <div className={`bst bst-${side} ${fx && fx.stance === 'strike' && fx.side !== side ? 'hit' : ''} ${fx && fx.stance === 'guard' && fx.side === side ? 'guarding' : ''}`}>
        <div className="bst-hp">
          <div className="bst-bar"><i style={{ width: `${hpPct * 100}%`, background: hpPct > 0.4 ? 'var(--green)' : hpPct > 0.2 ? 'var(--gold)' : 'var(--red)' }} /><span className="mono">{Math.max(0, st.hp)}</span></div>
        </div>
        <div className={`bst-guard ${st.guard ? 'on' : ''}`} title="Guard"><span>⛨</span><b className="mono">{st.guard}</b></div>
        <div className="bst-chips">
          {st.counter && <span className="chip-s counter">COUNTER</span>}
          {st.rally > 0 && <span className="chip-s rally">RALLY +{st.rally}</span>}
          {st.hex > 0 && <span className="chip-s hex">HEXED −{st.hex}</span>}
          {st.burn > 0 && <span className="chip-s burn">BURN {st.burn}</span>}
        </div>
        <div className="pops">{pops.filter((p) => p.side === side).map((p) => <span key={p.id} className={`pop pop-${p.kind}`}>{p.text}</span>)}</div>
      </div>
    )
  }

  const Hand = ({ side }) => {
    const hand = b[side].hand
    const left = hand.map((h, i) => ({ h, i })).filter(({ i }) => !usedSet.has(`${side}:${i}`))
    const n = left.length
    return (
      <div className={`fan fan-${side}`}>
        {left.map(({ h, i }, k) => {
          const d = resolve(h.ref)
          if (!d) return null
          const off = k - (n - 1) / 2
          const canPlay = side === 'you' && myTurn
          return (
            <button key={i} className={`fan-card ${canPlay ? 'ready' : ''}`} style={{ '--r': `${off * (side === 'you' ? 7 : -5)}deg`, '--y': `${Math.abs(off) * (side === 'you' ? 8 : -5)}px` }}
              onClick={() => { play('click'); setSheet({ side, idx: i }) }} aria-label={`${d.card.name}: attack ${h.stats.atk}, defense ${h.stats.def}`}>
              <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} stats={h.stats} />
            </button>
          )
        })}
      </div>
    )
  }

  const flying = fx && resolve(b[fx.side].hand[fx.idx].ref)
  return (
    <div className={`battle ${fx && fx.stance === 'strike' && fx.dmg >= 8 ? 'quake' : ''}`} role="dialog" aria-modal="true" aria-label={`Duel against ${r.name}`}>
      <div className="arena-bg" aria-hidden="true"><div className="ab-spot l" /><div className="ab-spot r" /><div className="ab-floor" /><div className="ab-dust" /></div>

      <header className="bt-top">
        <div className="bt-who">
          <Avatar seed={r.id} size={42} ring={tierColor(r.level)} />
          <div><b>{r.name}</b><div className="bt-sub"><Crest lvl={r.level} size={16} /> LV {r.level}{r.streak ? ` · ▲${r.streak}` : ''}</div></div>
          {chat && <div className="bt-chat">{chat}</div>}
          <button className="bt-x" onClick={forfeit} disabled={b.status !== 'active'} aria-label="Forfeit">FORFEIT</button>
        </div>
        <Status side="them" />
        <Hand side="them" />
      </header>

      <div className="bt-floor">
        <div className="bt-turn mono">
          {b.status !== 'active' && shown === b.log.length ? 'DUEL OVER' : thinking ? <>{r.name} is thinking<span className="dots"><i>.</i><i>.</i><i>.</i></span></> : myTurn ? 'YOUR TURN — tap a card' : ' '}
        </div>
        <div className="pile">
          {pile.length === 0 && <div className="pile-empty">PILE<br /><span className="fine">first card sets the element</span></div>}
          {pile.map((e, k) => {
            const d = resolve(b[e.side].hand[e.idx].ref)
            const top = k === pile.length - 1
            return d && (
              <div key={`${e.side}${e.idx}`} className={`pile-card ${top ? 'top' : ''}`} style={{ '--pr': `${(k - pile.length + 1) * 9 + (e.side === 'you' ? 4 : -4)}deg`, '--ec': EL[b[e.side].hand[e.idx].stats.element]?.color }}>
                <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} stats={b[e.side].hand[e.idx].stats} />
                {top && <span className={`pile-stance ${e.stance}`}>{e.stance === 'strike' ? '⚔' : '⛨'}</span>}
              </div>
            )
          })}
          {fx && flying && (
            <div className={`flyer from-${fx.side}`} key={`${fx.side}${fx.idx}`}>
              <CardFrame card={flying.card} rarity={flying.rarity} frame={flying.frame} footRight={flying.footRight} size="xs" tilt={false} showCount={false} stats={b[fx.side].hand[fx.idx].stats} />
            </div>
          )}
        </div>
        {pile.length > 0 && <div className="pile-el" style={{ color: EL[b[pile[pile.length - 1].side].hand[pile[pile.length - 1].idx].stats.element]?.color }}>TOP: {EL[b[pile[pile.length - 1].side].hand[pile[pile.length - 1].idx].stats.element]?.glyph} {EL[b[pile[pile.length - 1].side].hand[pile[pile.length - 1].idx].stats.element]?.name}</div>}
        {banner && <div className="turn-banner">{banner === 'start' ? 'DUEL START' : 'YOUR TURN'}</div>}
      </div>

      <footer className="bt-bottom">
        <Hand side="you" />
        <Status side="you" />
        <div className="bt-pot mono">{b.wager.type === 'coins' && b.wager.amount > 0 ? `POT ${fmt(b.wager.amount * 2)}` : b.wager.type === 'card' ? `CARD BET · ${b.wager.cardName}` : 'FRIENDLY'}</div>
      </footer>

      {sheet && <PlaySheet b={b} sheet={sheet} myTurn={myTurn} resolve={resolve} onAct={act} onClose={() => setSheet(null)} />}
      {showResult && b.status !== 'active' && <Result b={b} onClose={onClose} onRematch={() => onRematch(r)} />}
    </div>
  )
}

// Tap a card: its stats, its abilities, and the exact result of each stance.
function PlaySheet({ b, sheet, myTurn, resolve, onAct, onClose }) {
  const h = b[sheet.side].hand[sheet.idx]
  const d = resolve(h.ref)
  const mine = sheet.side === 'you'
  const can = mine && myTurn && !h.used
  const strike = can ? previewMove(b, 'you', sheet.idx, 'strike') : null
  const guard = can ? previewMove(b, 'you', sheet.idx, 'guard') : null
  // their biggest possible hit after each choice
  const threat = (stance) => {
    const m = JSON.parse(JSON.stringify(b))
    applyPlay(m, 'you', sheet.idx, stance)
    if (m.them.hp <= 0) return null
    return Math.max(0, ...m.them.hand.map((x, i) => (x.used ? 0 : previewMove(m, 'them', i, 'strike').dmg)))
  }
  const tS = can ? threat('strike') : null
  const tG = can ? threat('guard') : null
  const lethal = strike && strike.dmg >= b.them.hp
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${d.card.name}`}>
        <div className="sheet-card"><CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="sm" tilt={false} showCount={false} /></div>
        <div className="sheet-info">
          <h3>{d.card.name} {!mine && <span className="cpu-tag">{b.rival.name}'s</span>}</h3>
          <StatTiles stats={h.stats} />
          <Abilities list={h.stats.abilities} />
          {can && strike.bonuses.length > 0 && <div className="bonus-row">{strike.bonuses.map((x) => <span key={x.k} className={`bonus ${x.v < 0 ? 'neg' : ''}`}>{x.label} {x.v > 0 ? '+' : ''}{x.v}</span>)}</div>}
        </div>
        {can ? (
          <div className="stance-btns">
            <button className={`stance strike ${lethal ? 'lethal' : ''}`} onClick={() => onAct(sheet.idx, 'strike')}>
              <span className="st-ic">⚔</span>
              <span className="st-main">STRIKE <b>{strike.dmg}</b> dmg{lethal ? ' · KO!' : ''}</span>
              <span className="st-sub">
                {strike.absorbed ? `${strike.absorbed} soaked by guard · ` : ''}{strike.effects.filter((x) => x !== 'Counter').join(' · ')}{strike.heal ? ` · heal ${strike.heal}` : ''}{strike.reflect ? ` · you take ${strike.reflect} back` : ''}
                {tS != null && <><br />then they can hit for up to {tS}</>}
              </span>
            </button>
            <button className="stance guard" onClick={() => onAct(sheet.idx, 'guard')}>
              <span className="st-ic">⛨</span>
              <span className="st-main">GUARD <b>+{guard.guardGain}</b></span>
              <span className="st-sub">
                guard {b.you.guard} → {Math.min(GUARD_CAP, b.you.guard + guard.guardGain)}{guard.effects.length ? ' · ' + guard.effects.join(' · ') : ''}
                {tG != null && <><br />then they can hit for up to {tG}</>}
              </span>
            </button>
          </div>
        ) : (
          <p className="fine center">{mine ? (h.used ? 'Already played.' : 'Wait for your turn.') : 'Their card — plan around it.'}</p>
        )}
        <button className="link sheet-close" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

function Result({ b, onClose, onRematch }) {
  const { snap, rarityById } = useGame()
  const won = b.status === 'won', lost = b.status === 'lost'
  const cards = (b.payout?.cards || []).map((c) => ({ ...c, card: snap.cards.find((x) => x.id === c.cardId) })).filter((c) => c.card)
  return (
    <div className={`bt-result ${b.status}`}>
      {won && <div className="confetti" aria-hidden="true">{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ '--i': i }} />)}</div>}
      <div className="br-title">{won ? 'VICTORY' : lost ? 'DEFEAT' : 'DRAW'}</div>
      <div className="br-vs">
        <div><Avatar seed={'player:' + snap.player.name} size={48} ring="var(--accent)" /><span className="mono">{Math.max(0, b.you.hp)} HP</span></div>
        <span className="mono">vs</span>
        <div><Avatar seed={b.rival.id} size={48} ring={tierColor(b.rival.level)} /><span className="mono">{Math.max(0, b.them.hp)} HP</span></div>
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
