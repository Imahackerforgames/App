import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CardFrame, { CardBack } from './Card.jsx'
import PackArt from './PackArt.jsx'
import { Btn } from './ui.jsx'
import { useGame } from '../store.jsx'
import { play } from '../lib/sound.js'

// Presentation only. The cards were drawn and added to the inventory by the
// server before this component mounted, so closing it, skipping it or
// reloading the page mid-animation never loses or changes a pull.

const CHARGE_MS = [0, 0, 450, 800, 1200, 1800] // build-up before the flip, by tier

export default function PackOpening({ opening, pack, onClose, onAgain }) {
  const { snap, rarityById } = useGame()
  const [stage, setStage] = useState('sealed') // sealed | tearing | reveal | summary
  const [i, setI] = useState(0)
  const [phase, setPhase] = useState('back') // back | charging | shown
  const timers = useRef([])
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms))
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => { const p = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = p } }, [])

  // Reveal lowest tier first so the best card lands last.
  const cards = useMemo(() => opening.cards
    .map((c, idx) => ({ ...c, idx, card: snap.cards.find((x) => x.id === c.cardId), rarity: rarityById[c.rarityId] }))
    .filter((c) => c.card)
    .sort((a, b) => (a.rarity?.tier ?? 0) - (b.rarity?.tier ?? 0) || a.idx - b.idx), [opening, snap.cards, rarityById])
  const best = cards.reduce((m, c) => Math.max(m, c.rarity?.tier ?? 0), 0)
  const cur = cards[i]
  const tier = cur?.rarity?.tier ?? 0

  const tear = useCallback(() => {
    if (stage !== 'sealed') return
    play('open')
    setStage('tearing')
    later(() => { setStage('reveal'); setPhase('back') }, 900)
  }, [stage])

  const advance = useCallback(() => {
    if (stage === 'sealed') return tear()
    if (stage !== 'reveal') return
    if (phase === 'back') {
      const ms = CHARGE_MS[Math.min(tier, CHARGE_MS.length - 1)]
      if (ms) { setPhase('charging'); play('charge', tier); later(() => { setPhase('shown'); play('reveal', tier) }, ms) }
      else { play('flip'); setPhase('shown'); later(() => play('reveal', tier), 120) }
    } else if (phase === 'shown') {
      if (i < cards.length - 1) { play('hover'); setI(i + 1); setPhase('back') }
      else { setStage('summary'); play('coin') }
    }
  }, [stage, phase, tier, i, cards.length, tear])

  const skip = () => { timers.current.forEach(clearTimeout); play('click'); setStage('summary') }

  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') { if (stage === 'summary') onClose(); else skip() }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (stage !== 'summary') advance() }
    }
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  })

  const fxClass = stage === 'reveal' && phase !== 'back' ? `tier-${tier} ${phase}` : ''
  return (
    <div className={`opening ${fxClass} stage-${stage}`} style={{ '--tc': cur?.rarity?.color || '#7fe7ff', '--tc2': cur?.rarity?.color2 || '#2a1060' }} role="dialog" aria-modal="true" aria-label={`Opening ${pack.name}`}>
      <div className="op-rays" />
      <div className="op-flash" />
      {stage !== 'summary' && <button className="op-skip" onClick={skip}>SKIP ▶▶</button>}

      {(stage === 'sealed' || stage === 'tearing') && (
        <div className="op-center" onClick={tear} role="button" tabIndex={0} aria-label="Tap to open the pack">
          <div className={stage === 'sealed' ? 'op-pack-float' : 'op-pack-tear'}>
            <PackArt pack={pack} size="lg" shaking={stage === 'sealed'} torn={stage === 'tearing'} />
          </div>
          {stage === 'sealed' && <div className="op-hint blink">TAP TO OPEN</div>}
          {stage === 'tearing' && <div className="op-burst">{Array.from({ length: 24 }, (_, n) => <i key={n} style={{ '--n': n }} />)}</div>}
        </div>
      )}

      {stage === 'reveal' && cur && (
        <div className="op-center" onClick={advance} role="button" tabIndex={0} aria-label={phase === 'shown' ? 'Next card' : 'Reveal card'}>
          <div className="op-counter mono">{i + 1} / {cards.length}</div>
          <div className={`op-flip ${phase === 'shown' ? 'flipped' : ''}`} key={i}>
            <div className="op-flip-back"><CardBack size="lg" /></div>
            <div className="op-flip-front">
              <CardFrame card={cur.card} rarity={cur.rarity} size="lg" showCount={false} serial={cur.serial} revealing />
            </div>
          </div>
          {phase === 'shown' && (
            <div className="op-banner" style={{ '--c1': cur.rarity.color, '--c2': cur.rarity.color2 }}>
              <div className="op-rname">{cur.rarity.name}</div>
              {cur.isNew && <div className="op-new">NEW!</div>}
              {cur.serial && <div className="op-serial mono">LIMITED #{cur.serial}/{cur.card.limited.editionSize}</div>}
            </div>
          )}
          {phase === 'shown' && tier >= 3 && <div className="op-sparks">{Array.from({ length: 10 + tier * 6 }, (_, n) => <i key={n} style={{ '--n': n, '--c': cur.rarity.color }} />)}</div>}
          <div className="op-hint">{phase === 'back' ? 'TAP TO REVEAL' : phase === 'charging' ? '' : i < cards.length - 1 ? 'TAP FOR NEXT' : 'TAP TO FINISH'}</div>
        </div>
      )}

      {stage === 'summary' && (
        <div className="op-summary">
          <h2 className="op-sum-title">{pack.name.toUpperCase()} — RESULTS</h2>
          {best >= 4 && <p className="op-sum-best">A {cards.find((c) => c.rarity.tier === best).rarity.name} pull. Remarkable.</p>}
          <div className="op-sum-grid">
            {cards.map((c, n) => (
              <div className="op-sum-item" key={n} style={{ '--d': `${n * 70}ms` }}>
                <CardFrame card={c.card} rarity={c.rarity} size="md" showCount={false} serial={c.serial} />
                {c.isNew && <span className="op-new small">NEW</span>}
              </div>
            ))}
          </div>
          <p className="muted center">All {cards.length} cards have been added to your collection.</p>
          <div className="op-sum-btns">
            {onAgain && <Btn variant="primary" onClick={onAgain}>Open another</Btn>}
            <Btn variant="ghost" onClick={() => { onClose(); location.hash = '/collection' }}>View collection</Btn>
            <Btn variant="ghost" sound="back" onClick={onClose}>Done</Btn>
          </div>
        </div>
      )}
    </div>
  )
}
