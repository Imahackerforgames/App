import { useEffect, useState } from 'react'
import { GameProvider, useGame, useHashRoute, go } from './store.jsx'
import Logo from './components/Logo.jsx'
import { FighterDefs } from './components/Fighter.jsx'
import { AskHost, Cash, Toasts } from './components/ui.jsx'
import Home from './pages/Home.jsx'
import Collection from './pages/Collection.jsx'
import Shop from './pages/Shop.jsx'
import Profile from './pages/Profile.jsx'
import Admin from './pages/admin/Admin.jsx'
import Settings from './pages/Settings.jsx'
import Arena from './pages/Arena.jsx'
import Forge from './pages/Forge.jsx'
import { play, isMuted, setMuted, onMuteChange } from './lib/sound.js'
import { usePref } from './lib/prefs.js'
import DailyCalendar, { signinState } from './components/DailyCalendar.jsx'
import AuthModal, { RecoveryModal } from './components/Auth.jsx'

const NAV = [
  ['home', 'HOME', '⌂'],
  ['collection', 'CARDS', '▣'],
  ['shop', 'SHOP', '◈'],
  ['arena', 'ARENA', '⚔'],
  ['forge', 'FORGE', '⚒'],
]

export default function App() {
  return <GameProvider><Shell /></GameProvider>
}

function Shell() {
  const { snap, rank, bootError, account, guest, authOpen, setAuthOpen, recovery } = useGame()
  const route = useHashRoute()
  const [muted, setM] = useState(isMuted())
  const [crt, setCrt] = usePref('crt')
  useEffect(() => onMuteChange(setM), [])
  useEffect(() => { window.scrollTo(0, 0) }, [route])

  if (bootError) return <div className="boot"><Logo size={240} animated={false} /><p className="warn">ORVEL couldn't start: {bootError.message}</p><p className="muted">This browser may be blocking storage (private mode). Try a normal window.</p></div>
  if (!snap) return <div className="boot"><Logo size={260} /><p className="mono blink">LOADING…</p></div>

  const Page = { home: Home, collection: Collection, shop: Shop, profile: Profile, arena: Arena, forge: Forge, options: Settings, admin: Admin }[route] || Home
  return (
    <div className="app">
      <FighterDefs />
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
          {guest ? (
            <div className="tb-auth">
              <button className="tb-login" onClick={() => { play('click'); setAuthOpen('login') }}>Log in</button>
              <button className="tb-signup" onClick={() => { play('click'); setAuthOpen('signup') }}>Sign up</button>
            </div>
          ) : account ? (<>
            <a href="#profile" className="tb-rank" title={`${account.username || ''} · ${rank.rank.label} — ${Math.round(rank.progress * 100)}% to next`}>
              <span className="rank-badge sm" data-tier={rank.index}><span>{rank.index + 1}</span></span>
            </a>
            <a href="#shop" className="tb-cash"><Cash amount={snap.player.cash} /></a>
          </>) : null}
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
      <AutoDaily />
      {authOpen && <AuthModal key={authOpen} />}
      {recovery && <RecoveryModal />}
    </div>
  )
}

// Opens the sign-in calendar once per day, on the first visit, until claimed.
function AutoDaily() {
  const { snap } = useGame()
  const route = useHashRoute()
  const [open, setOpen] = useState(() => {
    const key = 'orvel:calShown:' + new Date().toISOString().slice(0, 10)
    try { if (sessionStorage.getItem(key)) return false; sessionStorage.setItem(key, '1') } catch {}
    return true
  })
  const { account, authOpen } = useGame()
  if (!open || !snap || !account || account.guest || authOpen || route === 'admin' || signinState(snap).claimedToday) return null
  return <DailyCalendar onClose={() => setOpen(false)} />
}
