import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CardFrame, { CardBack } from './Card.jsx'
import PackArt from './PackArt.jsx'
import { Btn, Cash } from './ui.jsx'
import { useGame, fmt } from '../store.jsx'
import { cardValue } from '../server/game.js'
import { play } from '../lib/sound.js'

// Presentation only. The cards were drawn and added to the inventory by the
// server before this component mounted, so closing it, skipping it or
// reloading the page mid-animation never loses or changes a pull.
//
// Controls
//   swipe          tear the pack / flip the card / fling it away for the next
//   hold (0.7 s)   auto-open the rest of the pack
//   tap            same as a swipe (fallback); during auto-open, stops it
//   keyboard       Enter/Space = next step, A = auto, Esc = skip

const CHARGE_MS = [0, 0, 350, 600, 900, 1200]
const HOLD_MS = 700
const SWIPE_PX = 70

export default function PackOpening({ opening, pack, onClose, onAgain }) {
  const { snap, rarityById } = useGame()
  const [stage, setStage] = useState('sealed') // sealed | tearing | reveal | finale | summary
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState('back') // back | charging | shown | leaving
  const [fin, setFin] = useState('build') // build | hit | shown
  const [auto, setAuto] = useState(false)
  const [drag, setDrag] = useState(null) // {dx, dy}
  const [fly, setFly] = useState(null) // {x, y} direction the card leaves in
  const [hold, setHold] = useState(0)
  const timers = useRef([])
  const autoT = useRef(null)
  const ptr = useRef(null)
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.current.push(t); return t }
  useEffect(() => () => { timers.current.forEach(clearTimeout); clearTimeout(autoT.current); cancelAnimationFrame(ptr.current?.raf) }, [])
  useEffect(() => { const p = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = p } }, [])

  // Lowest tier first; the last card is the rarest and gets the finale.
  const cards = useMemo(() => opening.cards
    .map((c, idx) => ({ ...c, idx, card: snap.cards.find((x) => x.id === c.cardId), rarity: rarityById[c.rarityId] }))
    .filter((c) => c.card && c.rarity)
    .map((c) => ({ ...c, value: cardValue(snap, c.card) }))
    .sort((a, b) => a.rarity.tier - b.rarity.tier || a.value - b.value || a.idx - b.idx), [opening, snap, rarityById])
  const last = cards.length - 1
  const best = cards[last]
  const cur = stage === 'finale' ? best : cards[i]
  const tier = cur?.rarity?.tier ?? 0
  const total = cards.reduce((t, c) => t + c.value, 0)

  // ── steps ──
  const tear = useCallback(() => {
    play('open')
    setStage('tearing'); setDrag(null)
    later(() => { setStage('reveal'); setI(0); setPhase('back') }, 800)
  }, [])

  const startFinale = useCallback(() => {
    const t = best.rarity.tier
    setStage('finale'); setFin('build'); setDrag(null)
    play('finaleBuild', t)
    later(() => { setFin('hit'); play('finaleHit', t); play('reveal', t) }, 1500 + t * 220)
    later(() => setFin('shown'), 1500 + t * 220 + 1500)
  }, [best])

  const reveal = useCallback(() => {
    if (i === last) return startFinale()
    const ms = CHARGE_MS[Math.min(tier, CHARGE_MS.length - 1)]
    setDrag(null)
    if (ms) { setPhase('charging'); play('charge', tier); later(() => { setPhase('shown'); play('reveal', tier) }, ms) }
    else { play('flip'); setPhase('shown'); later(() => play('reveal', tier), 140) }
  }, [i, last, tier, startFinale])

  const next = useCallback((dir = { x: -1, y: -0.2 }) => {
    play('swipe')
    setFly(dir); setPhase('leaving'); setDrag(null)
    later(() => { setFly(null); setI((n) => n + 1); setPhase('back') }, 260)
  }, [])

  const finish = useCallback(() => { timers.current.forEach(clearTimeout); clearTimeout(autoT.current); setAuto(false); setStage('summary'); play('coin') }, [])

  const step = useCallback((dir) => {
    if (stage === 'sealed') return tear()
    if (stage === 'reveal') {
      if (phase === 'back') return reveal()
      if (phase === 'shown') return next(dir)
    }
    if (stage === 'finale' && fin === 'shown') return finish()
  }, [stage, phase, fin, tear, reveal, next, finish])

  // ── auto-open driver ──
  useEffect(() => {
    clearTimeout(autoT.current)
    if (!auto) return
    let ms = null
    if (stage === 'sealed') ms = 250
    else if (stage === 'reveal' && phase === 'back') ms = 380
    else if (stage === 'reveal' && phase === 'shown') ms = 650 + tier * 260
    else if (stage === 'finale' && fin === 'shown') ms = 2600
    if (ms != null) autoT.current = setTimeout(() => step({ x: -1, y: -0.15 }), ms)
  }, [auto, stage, phase, fin, tier, step])

  // ── gestures ──
  const interactive = stage === 'sealed' || stage === 'reveal' || (stage === 'finale' && fin === 'shown')
  function down(e) {
    if (!interactive) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const p = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, held: false, raf: 0 }
    ptr.current = p
    if (!auto && stage !== 'finale') {
      const tick = () => {
        if (ptr.current !== p || p.moved) return
        const k = (performance.now() - p.t) / HOLD_MS
        if (k >= 1) { p.held = true; setHold(0); setAuto(true); play('click'); return }
        setHold(k)
        p.raf = requestAnimationFrame(tick)
      }
      p.raf = requestAnimationFrame(tick)
    }
  }
  function move(e) {
    const p = ptr.current
    if (!p || p.held) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    if (!p.moved && Math.hypot(dx, dy) > 12) { p.moved = true; cancelAnimationFrame(p.raf); setHold(0) }
    if (p.moved && !auto && (stage === 'sealed' || (stage === 'reveal' && (phase === 'back' || phase === 'shown')))) setDrag({ dx, dy })
  }
  function up(e) {
    const p = ptr.current
    ptr.current = null
    if (!p) return
    cancelAnimationFrame(p.raf); setHold(0)
    if (p.held) return
    const dx = e.clientX - p.x, dy = e.clientY - p.y
    const dist = Math.hypot(dx, dy)
    if (auto) { if (!p.moved) setAuto(false); return } // a tap pauses auto-open
    if (dist > SWIPE_PX) { step({ x: dx / dist, y: dy / dist }); return }
    setDrag(null)
    if (!p.moved) step({ x: -1, y: -0.2 })
  }

  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') { if (stage === 'summary') onClose(); else finish() }
      else if (stage !== 'summary' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); step() }
      else if (stage !== 'summary' && (e.key === 'a' || e.key === 'A')) setAuto((v) => !v)
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [stage, step, finish, onClose])

  const dragStyle = drag ? { transform: `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 14}deg)`, transition: 'none' } : undefined
  const flyStyle = fly ? { transform: `translate(${fly.x * 120}vw, ${fly.y * 120}vh) rotate(${fly.x * 40}deg)` } : undefined
  const fxClass = stage === 'reveal' && (phase === 'charging' || phase === 'shown') ? `tier-${tier} ${phase}` : ''
  const hint =
    auto ? 'AUTO-OPENING · TAP TO PAUSE'
    : stage === 'sealed' ? 'SWIPE TO OPEN · HOLD TO AUTO-OPEN'
    : stage === 'reveal' && phase === 'back' ? (i === last ? 'SWIPE TO REVEAL THE RAREST CARD' : 'SWIPE TO REVEAL · HOLD FOR AUTO')
    : stage === 'reveal' && phase === 'shown' ? (i === last - 1 ? 'SWIPE · THE RAREST CARD IS NEXT' : 'SWIPE FOR NEXT')
    : stage === 'finale' && fin === 'shown' ? 'TAP TO SEE ALL CARDS' : ''

  return (
    <div className={`opening ${fxClass} stage-${stage} ${stage === 'finale' ? `fin-${fin} ftier-${best.rarity.tier}` : ''}`}
      style={{ '--tc': cur?.rarity?.color || 'var(--accent-2)', '--tc2': cur?.rarity?.color2 || 'var(--bg-hi)' }}
      role="dialog" aria-modal="true" aria-label={`Opening ${pack.name}`}>
      <div className="op-rays" />
      <div className="op-flash" />
      {stage !== 'summary' && <button className="op-skip" onClick={finish}>SKIP ▶▶</button>}
      {stage !== 'summary' && stage !== 'finale' && (
        <button className={`op-auto ${auto ? 'on' : ''}`} onClick={() => { play('click'); setAuto(!auto) }} aria-pressed={auto}>{auto ? '❚❚ PAUSE' : '▶ AUTO'}</button>
      )}

      {stage !== 'summary' && (
        <div className="op-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
          role="button" tabIndex={0} aria-label={hint || 'Opening'}>

          {(stage === 'sealed' || stage === 'tearing') && (
            <div className="op-center">
              <div className={stage === 'sealed' ? 'op-pack-float' : 'op-pack-tear'} style={stage === 'sealed' ? dragStyle : undefined}>
                <PackArt pack={pack} size="lg" shaking={stage === 'sealed' && !drag} torn={stage === 'tearing'} />
              </div>
              {stage === 'tearing' && <div className="op-burst">{Array.from({ length: 24 }, (_, n) => <i key={n} style={{ '--n': n }} />)}</div>}
            </div>
          )}

          {stage === 'reveal' && cur && (
            <div className="op-center">
              <div className="op-counter mono">{i + 1} / {cards.length}</div>
              <div className="op-cardwrap">
              <div className="op-deck" aria-hidden="true">{cards.slice(i + 1).map((_, n) => <span key={n} style={{ '--k': n + 1 }} />)}</div>
              <div className={`op-drag ${fly ? 'flying' : ''}`} style={flyStyle || dragStyle}>
                <div className={`op-flip ${phase === 'shown' || phase === 'leaving' ? 'flipped' : ''}`} key={i}>
                  <div className="op-flip-back"><CardBack size="lg" /></div>
                  <div className="op-flip-front">
                    <CardFrame card={cur.card} rarity={cur.rarity} size="lg" showCount={false} serial={cur.serial} revealing tilt={false} />
                  </div>
                </div>
              </div>
              </div>
              <div className="op-banner-slot">
                {phase === 'shown' && (
                  <div className="op-banner" style={{ '--c1': cur.rarity.color, '--c2': cur.rarity.color2 }}>
                    <div className="op-rname">{cur.rarity.name}</div>
                    <div className="op-tags">
                      <span className="op-worth"><Cash amount={cur.value} /></span>
                      {cur.isNew && <span className="op-new">NEW!</span>}
                      {cur.serial && <span className="op-serial mono">#{cur.serial}/{cur.card.limited.editionSize}</span>}
                    </div>
                  </div>
                )}
              </div>
              {phase === 'shown' && tier >= 3 && <div className="op-sparks">{Array.from({ length: 10 + tier * 6 }, (_, n) => <i key={n} style={{ '--n': n, '--c': cur.rarity.color }} />)}</div>}
            </div>
          )}

          {stage === 'finale' && <Finale c={best} phase={fin} />}

          <div className="op-hint">{hint}</div>
          {hold > 0 && (
            <div className="op-hold" aria-hidden="true">
              <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" pathLength="1" style={{ strokeDashoffset: 1 - hold }} /></svg>
              <span>AUTO</span>
            </div>
          )}
        </div>
      )}

      {stage === 'summary' && (
        <div className="op-summary">
          <h2 className="op-sum-title">{pack.name.toUpperCase()}</h2>
          {best && (
            <div className="op-best" style={{ '--c1': best.rarity.color, '--c2': best.rarity.color2 }}>
              <div className="op-best-label">★ BEST PULL ★</div>
              <div className="op-best-card"><CardFrame card={best.card} rarity={best.rarity} size="md" showCount={false} serial={best.serial} /></div>
              <div className="op-best-info"><span className="op-best-r">{best.rarity.name}</span><Cash amount={best.value} big /></div>
            </div>
          )}
          <div className="op-sum-grid">
            {cards.slice(0, last).map((c, n) => (
              <div className="op-sum-item" key={n} style={{ '--d': `${n * 70}ms` }}>
                <CardFrame card={c.card} rarity={c.rarity} size="md" showCount={false} serial={c.serial} />
                {c.isNew && <span className="op-new small">NEW</span>}
                <span className="op-sum-val"><Cash amount={c.value} /></span>
              </div>
            ))}
          </div>
          <p className="muted center">All {cards.length} cards are in your collection · total sell value {fmt(total)}</p>
          <div className="op-sum-btns">
            {onAgain && <Btn variant="primary" onClick={onAgain}>Open another</Btn>}
            <Btn variant="ghost" onClick={() => { onClose(); location.hash = 'collection' }}>View collection</Btn>
            <Btn variant="ghost" sound="back" onClick={onClose}>Done</Btn>
          </div>
        </div>
      )}
    </div>
  )
}

// The rarest card in the pack: a slow build, a hit, then a count-up of its worth.
function Finale({ c, phase }) {
  const t = c.rarity.tier
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (phase === 'build') return
    let raf, start
    const dur = 900 + t * 150
    const f = (now) => {
      start ??= now
      const k = Math.min(1, (now - start) / dur)
      setShown(Math.round(c.value * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [phase === 'build', c.value, t])

  return (
    <div className="fin" style={{ '--c1': c.rarity.color, '--c2': c.rarity.color2 }}>
      <div className="fin-label">{phase === 'build' ? 'THE RAREST CARD…' : 'RAREST PULL'}</div>
      <div className="fin-pull" aria-hidden="true">{Array.from({ length: 16 + t * 4 }, (_, n) => <i key={n} style={{ '--n': n }} />)}</div>
      <div className="fin-rings" aria-hidden="true"><i /><i /><i /></div>
      <div className="fin-card">
        <div className="fin-spin">
          <div className="op-flip-back"><CardBack size="lg" /></div>
          <div className="op-flip-front"><CardFrame card={c.card} rarity={c.rarity} size="lg" showCount={false} serial={c.serial} tilt={false} /></div>
        </div>
      </div>
      <div className="fin-burst" aria-hidden="true">{Array.from({ length: 24 + t * 8 }, (_, n) => <i key={n} style={{ '--n': n }} />)}</div>
      <div className="fin-info">
        {phase !== 'build' && <>
          <div className="op-rname">{c.rarity.name}</div>
          <div className="fin-worth"><span className="fin-worth-l">WORTH</span><Cash amount={shown} big /></div>
          <div className="op-tags">
            {c.isNew && <span className="op-new">NEW!</span>}
            {c.serial && <span className="op-serial mono">LIMITED #{c.serial}/{c.card.limited.editionSize}</span>}
          </div>
        </>}
      </div>
    </div>
  )
}
