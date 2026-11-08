import { useState } from 'react'
import { Btn, Cash, Modal, WindowTitle } from './ui.jsx'
import PackOpening from './PackOpening.jsx'
import { useGame, fmt } from '../store.jsx'
import { FRAMES, CARD_EFFECTS } from '../server/battle.js'
import { play } from '../lib/sound.js'

export function signinState(snap) {
  const day = snap.player.signin?.day || 0
  const claimedToday = snap.player.lastDaily === new Date().toISOString().slice(0, 10)
  const total = snap.dailyRewards.length
  const next = claimedToday ? null : (day % total) + 1
  // within the current 30-day cycle, days up to `done` are collected
  const done = claimedToday ? day : next === 1 ? 0 : day
  return { day, claimedToday, next, done, total }
}

function rewardLabel(snap, r) {
  const bits = []
  if (r.pack) bits.push(snap.packs.find((p) => p.id === r.pack)?.name || 'Card pack')
  if (r.cosmetic) {
    const list = r.cosmetic.kind === 'frame' ? FRAMES : CARD_EFFECTS
    bits.push(`${list.find((x) => x.id === r.cosmetic.id)?.name} ${r.cosmetic.kind}`)
  }
  if (r.coins) bits.push(`${fmt(r.coins)} coins`)
  return bits.join(' + ')
}

export default function DailyCalendar({ onClose }) {
  const { snap, call, toast } = useGame()
  const st = signinState(snap)
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(null)
  const [claimed, setClaimed] = useState(null)

  async function claim() {
    setBusy(true)
    try {
      const r = await call((s) => s.claimDaily())
      play('cash')
      setClaimed(r)
      if (r.cosmetic) toast(`New ${r.cosmetic.kind}: ${r.cosmetic.name} — use it in the Forge`)
      if (r.opening) setOpening(r.opening)
    } catch {} finally { setBusy(false) }
  }

  if (opening) {
    const pack = snap.packs.find((p) => p.id === opening.packId)
    if (pack) return <PackOpening opening={opening} pack={pack} onClose={() => { setOpening(null) }} />
  }

  return (
    <Modal onClose={onClose} wide label="Daily sign-in" className="daily-modal">
      <WindowTitle onClose={onClose}>SIGN-IN · DAY {claimed?.day || st.next || st.day}/{st.total}</WindowTitle>
      <div className="cal-head">
        <p>Sign in every day to move one step along the calendar. Rewards grow as you go, with packs on days 7, 21 and 30. Missing a day doesn't reset your progress.</p>
        {claimed ? (
          <div className="cal-got"><span className="label">DAY {claimed.day} COLLECTED</span>{claimed.coins > 0 && <Cash amount={claimed.coins} big />}{claimed.cosmetic && <b>+ {claimed.cosmetic.name}</b>}{claimed.opening && <b>+ a pack</b>}</div>
        ) : st.next ? (
          <Btn onClick={claim} disabled={busy}>Claim day {st.next}</Btn>
        ) : <span className="mono muted">CLAIMED TODAY · BACK TOMORROW</span>}
      </div>
      <div className="cal-grid">
        {snap.dailyRewards.map((r, i) => {
          const d = i + 1
          const got = d <= (claimed ? claimed.day : st.done)
          const today = !claimed && d === st.next
          const big = r.pack || r.cosmetic
          return (
            <div key={d} className={`cal-day ${got ? 'got' : ''} ${today ? 'today' : ''} ${big ? 'big' : ''} ${d === st.total ? 'final' : ''}`} title={rewardLabel(snap, r)}>
              <span className="cal-n">{d}</span>
              <span className="cal-icon" aria-hidden="true">{r.pack ? '▤' : r.cosmetic ? (r.cosmetic.kind === 'frame' ? '▣' : '✦') : '●'}</span>
              <span className="cal-r">{r.pack ? 'PACK' : r.cosmetic ? r.cosmetic.kind.toUpperCase() : fmt(r.coins)}</span>
              {got && <span className="cal-check">✓</span>}
            </div>
          )
        })}
      </div>
      <p className="fine">Today: {st.next ? rewardLabel(snap, snap.dailyRewards[st.next - 1]) : 'collected'}. Tomorrow: {rewardLabel(snap, snap.dailyRewards[((claimed?.day || st.day) % st.total)])}.</p>
    </Modal>
  )
}
