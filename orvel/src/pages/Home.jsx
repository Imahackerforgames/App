import { useMemo } from 'react'
import Logo from '../components/Logo.jsx'
import PackArt from '../components/PackArt.jsx'
import CardFrame from '../components/Card.jsx'
import { Btn, Cash, Meter } from '../components/ui.jsx'
import { useGame, go, fmt } from '../store.jsx'
import { play } from '../lib/sound.js'

export default function Home() {
  const { snap, rank, completion, call, rarityById } = useGame()
  const today = new Date().toISOString().slice(0, 10)
  const dailyReady = snap.player.lastDaily !== today
  const featured = snap.packs.find((p) => p.featured && p.status.ok) || snap.packs.find((p) => p.status.ok)

  const lastPull = useMemo(() => {
    const t = snap.transactions.find((x) => x.type === 'pack_open')
    if (!t) return null
    return { ...t, cards: t.cards.map((id) => snap.cards.find((c) => c.id === id)).filter(Boolean) }
  }, [snap.transactions, snap.cards])

  async function daily() {
    try { await call((s) => s.claimDaily()); play('cash') } catch {}
  }

  const menu = [
    ['shop', 'OPEN PACKS', 'Spend Cash, pull cards'],
    ['collection', 'COLLECTION', `${completion.owned}/${completion.total} found`],
    ['profile', 'PLAYER FILE', rank.rank.label],
  ]

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-glow" />
        <Logo size={360} tagline />
        <p className="hero-sub">Original artwork. Collected one pack at a time.</p>
        <nav className="arcade-menu" aria-label="Main menu">
          {menu.map(([r, l, s], i) => (
            <button key={r} className="am-item" onMouseEnter={() => play('hover')} onClick={() => { play('click'); go(r) }} style={{ '--i': i }}>
              <span className="am-arrow">▶</span><span className="am-label">{l}</span><span className="am-sub">{s}</span>
            </button>
          ))}
        </nav>
      </section>

      <section className="home-grid">
        <div className="window panel">
          <div className="panel-title">DAILY BONUS</div>
          <div className="daily">
            <Cash amount={snap.settings.dailyReward} big />
            {dailyReady
              ? <Btn variant="primary" onClick={daily}>Claim</Btn>
              : <span className="muted mono">CLAIMED — BACK TOMORROW</span>}
          </div>
        </div>
        <div className="window panel">
          <div className="panel-title">RANK</div>
          <div className="rank-mini">
            <div className="rank-badge" data-tier={rank.index}><span>{rank.index + 1}</span></div>
            <div className="rank-mini-info">
              <div className="rank-name">{rank.rank.label}</div>
              <Meter value={rank.progress} label="Rank progress" color="var(--accent-2)" />
              <div className="mono muted">{rank.next ? `${fmt(snap.player.xp)} / ${fmt(rank.next.xp)} XP` : `${fmt(snap.player.xp)} XP · MAX RANK`}</div>
            </div>
          </div>
        </div>
        <div className="window panel">
          <div className="panel-title">COMPLETION</div>
          <div className="comp-big mono">{Math.floor(completion.pct * 100)}<small>%</small></div>
          <Meter value={completion.pct} label="Collection completion" />
          <div className="mono muted">{completion.owned} of {completion.total} cards · {fmt(snap.player.stats.packsOpened)} packs opened</div>
        </div>
      </section>

      {featured && (
        <section className="window home-feature" onClick={() => { play('click'); go('shop') }} role="button" tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && go('shop')}
          style={{ '--p1': featured.design.c1, '--p2': featured.design.c2, '--p3': featured.design.c3 }}>
          <PackArt pack={featured} size="sm" />
          <div>
            <div className="feat-kicker">NOW IN THE SHOP</div>
            <h2>{featured.name}</h2>
            <p>{featured.tagline}</p>
            <span className="link">Go to shop ▶</span>
          </div>
        </section>
      )}

      {lastPull && lastPull.cards.length > 0 && (
        <section>
          <div className="section-label">LAST PULL — {lastPull.packName?.toUpperCase()}</div>
          <div className="strip">
            {lastPull.cards.map((c, i) => <CardFrame key={i} card={c} rarity={rarityById[c.rarityId]} size="sm" showCount={false} />)}
          </div>
        </section>
      )}
    </div>
  )
}
