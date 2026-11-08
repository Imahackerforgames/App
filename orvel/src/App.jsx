import { useEffect, useState } from 'react'
import { GameProvider, useGame, useHashRoute, go } from './store.jsx'
import Logo from './components/Logo.jsx'
import { AskHost, Cash, Toasts } from './components/ui.jsx'
import Home from './pages/Home.jsx'
import Collection from './pages/Collection.jsx'
import Shop from './pages/Shop.jsx'
import Profile from './pages/Profile.jsx'
import Admin from './pages/admin/Admin.jsx'
import Settings from './pages/Settings.jsx'
import { play, isMuted, setMuted, onMuteChange } from './lib/sound.js'
import { usePref } from './lib/prefs.js'

const NAV = [
  ['home', 'HOME', '⌂'],
  ['collection', 'COLLECTION', '▣'],
  ['shop', 'SHOP', '◈'],
  ['profile', 'PLAYER', '☺'],
]

export default function App() {
  return <GameProvider><Shell /></GameProvider>
}

function Shell() {
  const { snap, rank, bootError } = useGame()
  const route = useHashRoute()
  const [muted, setM] = useState(isMuted())
  const [crt, setCrt] = usePref('crt')
  useEffect(() => onMuteChange(setM), [])
  useEffect(() => { window.scrollTo(0, 0) }, [route])

  if (bootError) return <div className="boot"><Logo size={240} animated={false} /><p className="warn">ORVEL couldn't start: {bootError.message}</p><p className="muted">This browser may be blocking storage (private mode). Try a normal window.</p></div>
  if (!snap) return <div className="boot"><Logo size={260} /><p className="mono blink">LOADING…</p></div>

  const Page = { home: Home, collection: Collection, shop: Shop, profile: Profile, options: Settings, admin: Admin }[route] || Home
  return (
    <div className="app">
      <div className="bg" aria-hidden="true"><div className="bg-grid" /><div className="bg-sun" /><div className="bg-scan" /></div>
      <header className="topbar">
        <button className="tb-logo" onClick={() => { play('click'); go('home') }} aria-label="ORVEL home"><Logo size={128} animated={false} /></button>
        <nav className="tb-nav" aria-label="Primary">
          {NAV.map(([r, l, ic]) => (
            <a key={r} href={`#${r}`} className={`nav-btn ${route === r ? 'on' : ''}`} onMouseEnter={() => play('hover')} onClick={() => play('click')} aria-current={route === r ? 'page' : undefined}>
              <span className="nav-ic" aria-hidden="true">{ic}</span><span className="nav-l">{l}</span>
            </a>
          ))}
        </nav>
        <div className="tb-right">
          <a href="#profile" className="tb-rank" title={`${rank.rank.label} — ${Math.round(rank.progress * 100)}% to next`}>
            <span className="rank-badge sm" data-tier={rank.index}><span>{rank.index + 1}</span></span>
          </a>
          <a href="#shop" className="tb-cash"><Cash amount={snap.player.cash} /></a>
          <button className="icon-btn tb-desk" onClick={() => { play('click'); setCrt(crt === 'off' ? 'on' : 'off') }} aria-pressed={crt !== 'off'} title="CRT effect" aria-label="Toggle CRT effect">▤</button>
          <button className="icon-btn tb-desk" onClick={() => { setMuted(!muted); if (muted) play('click') }} aria-pressed={!muted} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'} title={muted ? 'Sound off' : 'Sound on'}>{muted ? '🔇' : '🔊'}</button>
          <a href="#options" className={`icon-btn ${route === 'options' ? 'on' : ''}`} onClick={() => play('click')} title="Settings" aria-label="Settings">⚙</a>
        </div>
      </header>
      <main className="main" key={route}><Page /></main>
      <footer className="foot">
        <span>ORVEL © {new Date().getFullYear()} · All artwork belongs to its creator</span>
        <span>{snap.settings.currencyName} has no cash value</span>
        <a href="#admin" className="foot-admin">Creator dashboard</a>
      </footer>
      <Toasts />
      <AskHost />
    </div>
  )
}
