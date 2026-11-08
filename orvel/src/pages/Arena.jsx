import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CardFrame from '../components/Card.jsx'
import Avatar from '../components/Avatar.jsx'
import { Btn, Cash, Meter, Modal, RarityTag, WindowTitle } from '../components/ui.jsx'
import { useGame, fmt, server } from '../store.jsx'
import { customDisplay } from '../lib/customCard.js'
import { DECK_SIZE, MAX_HP, ABILITIES, ELEMENTS } from '../server/battle.js'
import { play } from '../lib/sound.js'

// Display info for a hand/deck reference: a catalog card or a Forge card.
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

export default function Arena() {
  const { snap, call } = useGame()
  const [rivals, setRivals] = useState(null)
  const [profile, setProfile] = useState(null)
  const [setup, setSetup] = useState(null)
  const [battle, setBattle] = useState(null)

  const loadRivals = useCallback(() => server.rivals().then(setRivals), [])
  useEffect(() => { loadRivals() }, [loadRivals, snap.player.battle])
  useEffect(() => { if (snap.activeBattleId && !battle) server.activeBattle().then((b) => b && setBattle(b)) }, [snap.activeBattleId])

  const b = snap.player.battle
  return (
    <div className="page arena">
      <header className="page-head">
        <h1 className="page-title"><span className="pt-icon">⚔</span> ARENA</h1>
        <div className="window arena-me">
          <Avatar seed={'player:' + snap.player.name} size={44} ring="var(--accent)" />
          <div>
            <div className="am-name">{snap.player.name}</div>
            <div className="mono muted">{b.wins}W · {b.losses}L{b.draws ? ` · ${b.draws}D` : ''}</div>
          </div>
          <div className="streak" title="Current win streak"><span className="streak-n">{b.streak}</span><span className="streak-l">STREAK</span></div>
        </div>
      </header>

      {snap.activeBattleId && !battle && (
        <div className="note">You have a battle in progress. <button className="link" onClick={() => server.activeBattle().then(setBattle)}>Resume it</button></div>
      )}

      <p className="muted arena-intro">Duel a rival with five cards. Bet coins or a card — win and you take home double. Your cards' battle stats come from their rarity and value; Forge cards use the stats you give them.</p>

      {!rivals ? <p className="mono blink">LOADING RIVALS…</p> : (
        <div className="rival-grid">
          {rivals.map((r) => (
            <div key={r.id} className="window rival" onClick={() => { play('click'); setProfile(r.id) }} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && setProfile(r.id)}>
              <Avatar seed={r.id} size={56} ring={tierColor(r.level)} />
              <div className="rv-main">
                <div className="rv-name">{r.name} <span className="lvl" style={{ '--lc': tierColor(r.level) }}>LV {r.level}</span></div>
                <div className="rv-meta mono">{fmt(r.wins)}W · {fmt(r.losses)}L · {Math.round((r.wins / Math.max(1, r.wins + r.losses)) * 100)}%</div>
                <div className="rv-tags">
                  {r.streak > 0 && <span className="rv-streak">▲ {r.streak} streak</span>}
                  <span className="rv-power">Deck {r.deckPower}</span>
                </div>
              </div>
              <Btn size="sm" onClick={(e) => { e.stopPropagation(); setSetup(r) }}>Duel</Btn>
            </div>
          ))}
        </div>
      )}

      {profile && <RivalProfile id={profile} onClose={() => setProfile(null)} onDuel={(r) => { setProfile(null); setSetup(r) }} />}
      {setup && <DuelSetup rival={setup} onClose={() => setSetup(null)} onStart={(bt) => { setSetup(null); setBattle(bt) }} />}
      {battle && <Battle initial={battle} onClose={() => { setBattle(null); loadRivals() }} onRematch={(r) => { setBattle(null); setSetup(r) }} />}
    </div>
  )
}

const tierColor = (lvl) => (lvl >= 50 ? '#ff3df2' : lvl >= 35 ? '#ffd166' : lvl >= 20 ? '#4fc3ff' : lvl >= 10 ? '#39ff88' : '#9aa7b4')

function RivalProfile({ id, onClose, onDuel }) {
  const { snap, rarityById } = useGame()
  const [p, setP] = useState(null)
  useEffect(() => { server.rivalProfile(id).then(setP) }, [id])
  const fav = p && snap.cards.find((c) => c.id === p.favoriteCardId)
  return (
    <Modal onClose={onClose} wide label="Player profile">
      <WindowTitle onClose={onClose}>PLAYER PROFILE</WindowTitle>
      {!p ? <p className="mono blink">LOADING…</p> : (
        <div className="profile-body">
          <div className="pf-head">
            <Avatar seed={p.id} size={88} ring={tierColor(p.level)} />
            <div className="pf-id">
              <div className="pf-name">{p.name} <span className="cpu-tag" title="Computer-controlled rival">CPU</span></div>
              <div className="lvl big" style={{ '--lc': tierColor(p.level) }}>LEVEL {p.level}</div>
              <p className="pf-bio">“{p.bio}”</p>
            </div>
          </div>
          <div className="pf-stats">
            <div className="window stat"><div className="label">WIN STREAK</div><div className="stat-v mono">{p.streak}</div></div>
            <div className="window stat"><div className="label">RECORD</div><div className="stat-v mono">{fmt(p.wins)}–{fmt(p.losses)}</div></div>
            <div className="window stat"><div className="label">WIN RATE</div><div className="stat-v mono">{Math.round((p.wins / Math.max(1, p.wins + p.losses)) * 100)}%</div></div>
            <div className="window stat"><div className="label">CARDS</div><div className="stat-v mono">{p.totalCards}</div></div>
            <div className="window stat"><div className="label">BETS UP TO</div><div className="stat-v"><Cash amount={p.betCap} /></div></div>
          </div>
          {fav && (
            <div className="pf-fav">
              <div className="label">FAVORITE CARD</div>
              <div className="pf-fav-row"><CardFrame card={fav} rarity={rarityById[fav.rarityId]} size="sm" showCount={false} /><div><b>{fav.name}</b><br /><RarityTag rarity={rarityById[fav.rarityId]} /></div></div>
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

const DECK_KEY = 'orvel:lastDeck'
function DuelSetup({ rival, onClose, onStart }) {
  const { snap, rarityById, call } = useGame()
  const resolve = useResolve()
  const options = useMemo(() => {
    const own = snap.cards.filter((c) => snap.player.inventory[c.id]?.count > 0)
      .map((c) => ({ ref: { kind: 'card', id: c.id }, stats: snap.cardStats[c.id], count: snap.player.inventory[c.id].count }))
    const customs = snap.player.customs.map((c) => ({ ref: { kind: 'custom', id: c.id }, stats: { atk: c.atk, def: c.def, element: c.element, abilities: c.abilities }, count: 1 }))
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

  return (
    <Modal onClose={onClose} wide label="Duel setup">
      <WindowTitle onClose={onClose}>DUEL · {rival.name.toUpperCase()}</WindowTitle>
      <div className="duel-setup">
        <div className="ds-vs">
          <Avatar seed={'player:' + snap.player.name} size={48} ring="var(--accent)" />
          <span className="ds-vs-x">VS</span>
          <Avatar seed={rival.id} size={48} ring={tierColor(rival.level)} />
          <div><b>{rival.name}</b> <span className="lvl" style={{ '--lc': tierColor(rival.level) }}>LV {rival.level}</span><div className="mono muted">deck power {rival.deckPower}</div></div>
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
                  <button key={k} className={`ds-card ${on ? 'on' : ''}`} onClick={() => toggle(k)} aria-pressed={on}>
                    <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="sm" tilt={false} showCount={false} stats={o.stats} />
                    {on && <span className="ds-check">{deck.indexOf(k) + 1}</span>}
                  </button>
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
              <span className="fine">Win: you keep your bet and take theirs — double. Lose: {stake.type === 'coins' ? 'your coins go to them' : 'your card goes to their collection'}. Draw: everyone gets their bet back.</span>
            </div>
          )}
        </section>
        <div className="confirm-btns">
          <Btn variant="ghost" sound="back" onClick={onClose}>Cancel</Btn>
          <Btn disabled={!ready || busy} onClick={start}>Start duel</Btn>
        </div>
      </div>
    </Modal>
  )
}

const CHAT = {
  youWin: ['ugh', 'ok nice', 'wait what', 'lucky', 'hm.'],
  theyWin: ['gotcha', ':)', 'too easy?', 'yes!!', 'called it'],
  even: ['close', 'trade', 'hmm'],
}
const pick = (a) => a[Math.floor(Math.random() * a.length)]

function Battle({ initial, onClose, onRematch }) {
  const { call, snap, rarityById } = useGame()
  const resolve = useResolve()
  const [b, setB] = useState(initial)
  const [sel, setSel] = useState(null)
  const [thinking, setThinking] = useState(false)
  const [chat, setChat] = useState(initial.rival.line)
  const [showResult, setShowResult] = useState(initial.status !== 'active')
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => { const p = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = p } }, [])
  useEffect(() => { if (!chat) return; const t = setTimeout(() => setChat(null), 2600); return () => clearTimeout(t) }, [chat])

  const last = b.log[b.log.length - 1]
  const roundNo = Math.min(b.log.length + 1, DECK_SIZE)

  async function playCard(i) {
    if (thinking || b.status !== 'active' || b.you.hand[i].used) return
    setThinking(true); setSel(i); play('flip')
    await new Promise((r) => timers.current.push(setTimeout(r, 550 + Math.random() * 500)))
    try {
      const nb = await call((s) => s.playRound(b.id, i))
      setB(nb); setSel(null)
      const e = nb.log[nb.log.length - 1]
      const diff = e.toN - e.toP
      play(diff > 0 ? 'coin' : diff < 0 ? 'error' : 'click')
      if (Math.random() < 0.55) setChat(pick(diff > 0 ? CHAT.youWin : diff < 0 ? CHAT.theyWin : CHAT.even))
      if (nb.status !== 'active') timers.current.push(setTimeout(() => { setShowResult(true); play(nb.status === 'won' ? 'cash' : 'back') }, 1400))
    } catch {} finally { setThinking(false) }
  }
  async function forfeit() {
    try { const nb = await call((s) => s.forfeit(b.id)); setB(nb); setShowResult(true) } catch {}
  }

  const Hand = ({ side, hand, mine }) => (
    <div className={`bt-hand ${mine ? 'mine' : 'theirs'}`}>
      {hand.map((h, i) => {
        const d = resolve(h.ref)
        if (!d) return <div key={i} className="bt-slot" />
        return (
          <button key={i} className={`bt-card ${h.used ? 'used' : ''} ${sel === i && mine ? 'sel' : ''}`} disabled={!mine || h.used || thinking || b.status !== 'active'}
            onClick={() => mine && playCard(i)} aria-label={`${d.card.name}, attack ${h.stats.atk}, defense ${h.stats.def}`}>
            <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="xs" tilt={false} showCount={false} stats={h.stats} />
          </button>
        )
      })}
    </div>
  )
  const hpBar = (hp) => <div className="bt-hp"><Meter value={Math.max(0, hp) / MAX_HP} color={hp > 12 ? 'var(--green)' : hp > 6 ? 'var(--gold)' : 'var(--red)'} label="HP" /><span className="mono">{Math.max(0, hp)}/{MAX_HP}</span></div>

  const pCard = last && resolve(b.you.hand[last.p].ref)
  const nCard = last && resolve(b.them.hand[last.n].ref)
  const r = b.rival

  return (
    <div className="battle" role="dialog" aria-modal="true" aria-label={`Duel against ${r.name}`}>
      <div className="bt-top">
        <div className="bt-player">
          <Avatar seed={r.id} size={40} ring={tierColor(r.level)} />
          <div className="bt-who"><b>{r.name}</b> <span className="lvl" style={{ '--lc': tierColor(r.level) }}>LV {r.level}</span>{r.streak > 0 && <span className="rv-streak small">▲{r.streak}</span>}</div>
          {chat && <div className="bt-chat">{chat}</div>}
        </div>
        {hpBar(b.them.hp)}
        <Hand hand={b.them.hand} />
      </div>

      <div className="bt-mid">
        <div className="bt-round mono">ROUND {roundNo}/{DECK_SIZE}{b.wager.type === 'coins' && b.wager.amount > 0 ? ` · POT ${fmt(b.wager.amount * 2)}` : b.wager.type === 'card' ? ' · CARD BET' : ''}</div>
        {thinking ? <div className="bt-think mono">{r.name} is choosing<span className="dots"><i>.</i><i>.</i><i>.</i></span></div>
          : last ? (
            <div className="bt-clash" key={b.log.length}>
              <div className="bt-c you"><CardFrame card={pCard.card} rarity={pCard.rarity} frame={pCard.frame} footRight={pCard.footRight} size="xs" tilt={false} showCount={false} stats={b.you.hand[last.p].stats} /><span className="dmg">−{last.toP}</span></div>
              <span className="bt-x">✕</span>
              <div className="bt-c them"><CardFrame card={nCard.card} rarity={nCard.rarity} frame={nCard.frame} footRight={nCard.footRight} size="xs" tilt={false} showCount={false} stats={b.them.hand[last.n].stats} /><span className="dmg">−{last.toN}</span></div>
              {last.notes.length > 0 && <div className="bt-notes">{last.notes.map((n, k) => <span key={k} className={n.who}>{n.who === 'p' ? 'You' : r.name}: {n.text}</span>)}</div>}
            </div>
          ) : <div className="bt-think mono">Pick a card. Both of you play at once — read their hand.</div>}
      </div>

      <div className="bt-bottom">
        <Hand hand={b.you.hand} mine />
        {hpBar(b.you.hp)}
        <div className="bt-actions">
          <details className="bt-rules"><summary>How it works</summary>
            <p>Each round you both play a card at the same time. Damage = your ATK minus 60% of their DEF (at least 1). {ELEMENTS.map((e) => `${e.glyph} ${e.name}`).join(' beats ')} beats {ELEMENTS[0].glyph} {ELEMENTS[0].name}: +3 ATK. After 5 rounds, more HP wins.</p>
            <ul>{ABILITIES.map((a) => <li key={a.id}><b>{a.name}</b> — {a.text}</li>)}</ul>
          </details>
          {b.status === 'active' && <button className="link" onClick={forfeit}>Forfeit</button>}
        </div>
      </div>

      {showResult && b.status !== 'active' && <Result b={b} onClose={onClose} onRematch={() => onRematch(r)} />}
    </div>
  )
}

function Result({ b, onClose, onRematch }) {
  const { snap, rarityById } = useGame()
  const won = b.status === 'won', lost = b.status === 'lost'
  const cards = (b.payout?.cards || []).map((c) => ({ ...c, card: snap.cards.find((x) => x.id === c.cardId) })).filter((c) => c.card)
  return (
    <div className={`bt-result ${b.status}`}>
      <div className="br-title">{won ? 'VICTORY' : lost ? 'DEFEAT' : 'DRAW'}</div>
      <div className="mono br-hp">{Math.max(0, b.you.hp)} HP vs {Math.max(0, b.them.hp)} HP</div>
      {won && b.wager.type === 'coins' && b.wager.amount > 0 && <div className="br-pay">+<Cash amount={b.payout.coins} big /></div>}
      {won && cards.length > 0 && (
        <div className="br-cards">{cards.map((c, i) => (
          <div key={i} className="br-card"><CardFrame card={c.card} rarity={rarityById[c.card.rarityId]} size="sm" showCount={false} /><span className="fine">{c.returned ? 'Your card back' : c.isNew ? 'NEW — won from ' + b.rival.name : 'Won from ' + b.rival.name}</span></div>
        ))}</div>
      )}
      {lost && b.wager.type === 'coins' && b.wager.amount > 0 && <p>{b.rival.name} takes {fmt(b.wager.amount)} coins.</p>}
      {lost && b.wager.type === 'card' && <p>{b.wager.cardName} joins {b.rival.name}'s collection. Beat them in a card duel to see it in their profile.</p>}
      {b.status === 'draw' && <p>Bets returned.</p>}
      <div className="mono muted">Your streak: {snap.player.battle.streak} · best {snap.player.battle.best}</div>
      <div className="op-sum-btns">
        <Btn onClick={onRematch}>Rematch</Btn>
        <Btn variant="ghost" sound="back" onClick={onClose}>Back to arena</Btn>
      </div>
    </div>
  )
}
