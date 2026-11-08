import { useState } from 'react'
import { Btn, Cash, Meter } from '../components/ui.jsx'
import { useGame, fmt } from '../store.jsx'
import { usd } from './Shop.jsx'

const TX_LABEL = {
  pack_purchase: 'Pack purchase', pack_open: 'Pack opened', sale: 'Card sold',
  daily: 'Daily bonus', grant: 'Adjustment',
}

export default function Profile() {
  const { snap, rank, completion, call, totalCopies } = useGame()
  const [name, setName] = useState(snap.player.name)
  const p = snap.player
  return (
    <div className="page profile">
      <header className="page-head"><h1 className="page-title"><span className="pt-icon">☺</span> PLAYER FILE</h1></header>

      <section className="window rank-card">
        <div className="rank-big">
          <div className="rank-badge big" data-tier={rank.index}><span>{rank.index + 1}</span></div>
          <div className="rank-info">
            <form className="name-edit" onSubmit={(e) => { e.preventDefault(); call((s) => s.setPlayerName(name)).catch(() => {}) }}>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} aria-label="Player name" />
              {name !== p.name && <Btn size="sm" type="submit">Save</Btn>}
            </form>
            <div className="rank-name big">{rank.rank.label}</div>
            <Meter value={rank.progress} label="Progress to next rank" color="var(--accent-2)" />
            <div className="mono muted">{rank.next ? `${fmt(p.xp)} XP · ${fmt(rank.next.xp - p.xp)} to ${rank.next.label}` : `${fmt(p.xp)} XP · highest rank reached`}</div>
          </div>
        </div>
        <div className="ladder" aria-label="Rank ladder">
          {snap.ranks.map((r, i) => (
            <div key={r.id} className={`rung ${i < rank.index ? 'done' : i === rank.index ? 'cur' : ''}`}>
              <span className="rung-n">{i + 1}</span>
              <span className="rung-l">{r.label}</span>
              <span className="rung-xp mono">{fmt(r.xp)}</span>
            </div>
          ))}
        </div>
        <p className="fine">Rank reflects dedication, not luck: you earn XP for every pack opened ({snap.xpRules.perPack}), every new card discovered ({snap.xpRules.perNewCard}), each card pulled (more for rarer cards), and each card sold ({snap.xpRules.perSale}).</p>
      </section>

      <section className="stats-grid">
        {[
          ['WALLET', <Cash amount={p.cash} big />],
          ['UNIQUE CARDS', `${completion.owned} / ${completion.total}`],
          ['TOTAL COPIES', fmt(totalCopies)],
          ['PACKS OPENED', fmt(p.stats.packsOpened)],
          ['CARDS PULLED', fmt(p.stats.cardsPulled)],
          ['CARDS SOLD', fmt(p.stats.cardsSold)],
          ['CASH EARNED', fmt(p.stats.cashEarned)],
          ['CASH SPENT', fmt(p.stats.cashSpent)],
        ].map(([k, v]) => <div key={k} className="window stat"><div className="label">{k}</div><div className="stat-v mono">{v}</div></div>)}
      </section>

      <section className="window">
        <div className="panel-title">TRANSACTION LOG</div>
        {snap.transactions.length === 0 ? <p className="muted">No transactions yet.</p> : (
          <div className="txs">
            {snap.transactions.slice(0, 100).map((t) => (
              <div key={t.id} className={`tx tx-${t.type}`}>
                <span className="tx-time mono">{new Date(t.at).toLocaleString()}</span>
                <span className="tx-what">{TX_LABEL[t.type] || t.type}{' '}
                  <span className="muted">{t.type === 'sale' ? `${t.qty}× ${t.cardName}${t.bulk ? ' (bulk)' : ''}` : t.packName || ''}{t.method === 'real_money_simulated' ? ' · simulated payment' : ''}</span>
                </span>
                <span className="tx-amt mono">
                  {t.amountUsd != null ? usd(t.amountUsd) : t.amount != null ? (t.amount > 0 ? '+' : '') + fmt(t.amount) : t.cards ? `${t.cards.length} cards` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
