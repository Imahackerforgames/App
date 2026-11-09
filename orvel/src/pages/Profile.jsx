import { useRef, useState } from 'react'
import Avatar, { playerPic } from '../components/Avatar.jsx'
import { PORTRAITS } from '../lib/portraits.js'
import { play } from '../lib/sound.js'
import { Btn, Cash, Meter } from '../components/ui.jsx'
import { useGame, fmt } from '../store.jsx'
import { usd } from './Shop.jsx'

const TX_LABEL = {
  pack_purchase: 'Pack purchase', pack_open: 'Pack opened', sale: 'Card sold',
  daily: 'Daily bonus', grant: 'Adjustment',
  battle: 'Duel', battle_start: 'Duel started', cosmetic: 'Forge item', forge: 'Card forged', upgrade: 'Card upgraded',
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
          <PicEditor />
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
                  <span className="muted">{t.type === 'sale' ? `${t.qty}× ${t.cardName}${t.bulk ? ' (bulk)' : ''}` : t.type === 'battle' ? `${t.result} vs ${t.rivalName}` : t.type === 'battle_start' ? `vs ${t.rivalName}` : t.itemName || t.cardName || t.packName || ''}{t.method === 'real_money_simulated' ? ' · simulated payment' : ''}</span>
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

// Shrinks a picture to a 160px square (cropped to the middle) so it stays
// small enough to save with the account.
function shrink(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error('Pick an image file (PNG or JPG)'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const n = 160, c = document.createElement('canvas')
      c.width = n; c.height = n
      const s = Math.min(img.width, img.height)
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, n, n)
      URL.revokeObjectURL(url)
      let out = c.toDataURL('image/webp', 0.85)
      if (!out.startsWith('data:image/webp')) out = c.toDataURL('image/jpeg', 0.85)
      for (let q = 0.7; out.length > 110000 && q > 0.3; q -= 0.15) out = c.toDataURL('image/jpeg', q)
      resolve(out)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That picture could not be opened')) }
    img.src = url
  })
}

// Your profile picture: one of the drawn portraits, your own picture, or the
// pixel face. Saved with your account.
function PicEditor() {
  const { snap, call, toast } = useGame()
  const [open, setOpen] = useState(false)
  const [, bump] = useState(0)
  const fileRef = useRef(null)
  const pic = playerPic(snap.player)
  async function save(v) {
    try {
      await call((s) => s.setAvatar(v), { quiet: true })
      try { localStorage.removeItem('orvel:avatar') } catch {}
      play('coin'); toast('Profile picture updated')
    } catch (e) {
      if (e.code === 'invalid') { play('error'); toast(e.message, 'error'); return }
      // the server can't store pictures yet: keep it on this device
      try { v ? localStorage.setItem('orvel:avatar', JSON.stringify(v)) : localStorage.removeItem('orvel:avatar') } catch {}
      bump((n) => n + 1); play('coin'); toast('Profile picture saved on this device')
    }
  }
  async function upload(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { await save({ kind: 'upload', data: await shrink(f) }) } catch (err) { play('error'); toast(err.message, 'error') }
  }
  return (
    <div className="pic-edit">
      <button className="pic-current" onClick={() => { play('click'); setOpen(!open) }} aria-expanded={open} aria-label="Change profile picture">
        <Avatar seed={'player:' + snap.player.name} pic={pic} size={96} ring="var(--accent)" />
        <span className="pic-pen">✎</span>
      </button>
      {open && (
        <div className="pic-panel" role="dialog" aria-label="Choose a profile picture">
          <div className="label">PROFILE PICTURE</div>
          <div className="pic-grid">
            {PORTRAITS.map((p) => (
              <button key={p.id} className={`pic-opt ${pic?.kind === 'preset' && pic.id === p.id ? 'on' : ''}`} onClick={() => save({ kind: 'preset', id: p.id })} aria-label={`Use the ${p.name} picture`}>
                <img src={p.src} alt="" />
              </button>
            ))}
          </div>
          <div className="pic-actions">
            <Btn size="sm" onClick={() => fileRef.current?.click()}>Upload your own</Btn>
            {pic && <button className="link" onClick={() => save(null)}>Use pixel face</button>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={upload} />
          </div>
          <p className="fine">Your picture shows in the Arena and in duels. Uploads are cropped to a square.</p>
        </div>
      )}
    </div>
  )
}
