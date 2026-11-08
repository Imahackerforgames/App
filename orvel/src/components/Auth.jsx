import { useState } from 'react'
import { Btn, Modal, WindowTitle } from './ui.jsx'
import Logo from './Logo.jsx'
import { useGame } from '../store.jsx'
import { account } from '../lib/cloud.js'
import { play } from '../lib/sound.js'

const TABS = [['signup', 'Sign up'], ['login', 'Log in']]

// Sign up, log in, and "forgot password" — username, email and password only.
export default function AuthModal() {
  const { authOpen, setAuthOpen, toast } = useGame()
  const [tab, setTab] = useState(authOpen)
  const [f, setF] = useState({ username: '', email: '', password: '', confirm: '', identifier: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const close = () => setAuthOpen(null)
  const go = (t) => { play('hover'); setTab(t); setErr(''); setSent(false) }

  async function submit(e) {
    e.preventDefault(); setErr('')
    if (tab === 'signup') {
      if (!/^[A-Za-z0-9_.]{3,16}$/.test(f.username)) return setErr('Usernames are 3–16 letters, numbers, dots or underscores')
      if (f.password.length < 8) return setErr('Passwords need at least 8 characters')
      if (f.password !== f.confirm) return setErr('The two passwords do not match')
    }
    setBusy(true)
    try {
      if (tab === 'signup') { await account.signup(f.username.trim(), f.email.trim(), f.password); play('cash'); toast(`Welcome to ORVEL, ${f.username.trim()}! Your progress now saves to your account.`); close() }
      else if (tab === 'login') { await account.login(f.identifier.trim(), f.password); play('coin'); toast('Welcome back'); close() }
      else { await account.forgot(f.identifier.trim()); setSent(true) }
    } catch (e2) { play('error'); setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <Modal onClose={close} label="Account" className="auth-modal">
      <WindowTitle onClose={close}>{tab === 'forgot' ? 'RESET PASSWORD' : 'YOUR ORVEL ACCOUNT'}</WindowTitle>
      <div className="auth-logo"><Logo size={170} animated={false} /></div>
      {tab !== 'forgot' && (
        <div className="seg auth-tabs" role="tablist">
          {TABS.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => go(id)}>{l}</button>)}
        </div>
      )}
      <form className="auth-form" onSubmit={submit}>
        {tab === 'signup' && <>
          <label className="field"><span>Username</span><input id="su-user" value={f.username} onChange={set('username')} autoComplete="username" maxLength={16} placeholder="3–16 letters or numbers" autoFocus /></label>
          <label className="field"><span>Email</span><input id="su-email" type="email" value={f.email} onChange={set('email')} autoComplete="email" placeholder="for password resets" /></label>
          <label className="field"><span>Password</span><input id="su-pass" type="password" value={f.password} onChange={set('password')} autoComplete="new-password" placeholder="at least 8 characters" /></label>
          <label className="field"><span>Confirm password</span><input id="su-pass2" type="password" value={f.confirm} onChange={set('confirm')} autoComplete="new-password" /></label>
        </>}
        {tab === 'login' && <>
          <label className="field"><span>Username or email</span><input id="li-user" value={f.identifier} onChange={set('identifier')} autoComplete="username" autoFocus /></label>
          <label className="field"><span>Password</span><input id="li-pass" type="password" value={f.password} onChange={set('password')} autoComplete="current-password" /></label>
        </>}
        {tab === 'forgot' && (sent ? (
          <p className="auth-sent">If that account exists, a reset link is on its way to the email it was created with. Open it on this device to choose a new password.</p>
        ) : <>
          <p className="muted">Enter your username or email and we'll email you a link to choose a new password.</p>
          <label className="field"><span>Username or email</span><input id="fp-user" value={f.identifier} onChange={set('identifier')} autoComplete="username" autoFocus /></label>
        </>)}
        {err && <p className="warn" role="alert">{err}</p>}
        {!(tab === 'forgot' && sent) && <Btn type="submit" disabled={busy}>{busy ? 'One moment…' : tab === 'signup' ? 'Create account' : tab === 'login' ? 'Log in' : 'Send reset link'}</Btn>}
        <div className="auth-links">
          {tab === 'login' && <button type="button" className="link" onClick={() => go('forgot')}>Forgot password?</button>}
          {tab === 'forgot' && <button type="button" className="link" onClick={() => go('login')}>Back to log in</button>}
        </div>
        {tab === 'signup' && <p className="fine">Free to play. Your cards, coins, rank and Forge cards are saved to your account, so you can close the app, log out, or switch phones and pick up where you left off.</p>}
      </form>
    </Modal>
  )
}

// Opened by the link in a password-reset email.
export function RecoveryModal() {
  const { setRecovery, toast } = useGame()
  const [p, setP] = useState(''), [c, setC] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setErr('')
    if (p.length < 8) return setErr('Passwords need at least 8 characters')
    if (p !== c) return setErr('The two passwords do not match')
    setBusy(true)
    try { await account.changePassword(p); toast('Password changed — you are logged in'); setRecovery(false); history.replaceState(null, '', location.pathname) }
    catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <Modal onClose={() => setRecovery(false)} label="Choose a new password">
      <WindowTitle onClose={() => setRecovery(false)}>CHOOSE A NEW PASSWORD</WindowTitle>
      <form className="auth-form" onSubmit={submit}>
        <label className="field"><span>New password</span><input id="rc-pass" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="new-password" autoFocus /></label>
        <label className="field"><span>Confirm new password</span><input id="rc-pass2" type="password" value={c} onChange={(e) => setC(e.target.value)} autoComplete="new-password" /></label>
        {err && <p className="warn" role="alert">{err}</p>}
        <Btn type="submit" disabled={busy}>Save new password</Btn>
      </form>
    </Modal>
  )
}

// Account panel for the Settings page.
export function AccountPanel() {
  const { account: me, setAuthOpen, toast } = useGame()
  const [p, setP] = useState(''), [c, setC] = useState('')
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false)
  if (!me || me.local) return null
  if (me.guest) return (
    <section className="window">
      <div className="panel-title">ACCOUNT</div>
      <p className="muted">You're playing as a guest. Create a free account to save your collection.</p>
      <div className="adm-bar"><Btn onClick={() => setAuthOpen('signup')}>Sign up</Btn><Btn variant="ghost" onClick={() => setAuthOpen('login')}>Log in</Btn></div>
    </section>
  )
  async function change(e) {
    e.preventDefault(); setErr('')
    if (p.length < 8) return setErr('Passwords need at least 8 characters')
    if (p !== c) return setErr('The two passwords do not match')
    setBusy(true)
    try { await account.changePassword(p); setP(''); setC(''); toast('Password changed') } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <section className="window account-panel">
      <div className="panel-title">ACCOUNT</div>
      <dl className="vi-stats">
        <div><dt>USERNAME</dt><dd>{me.username}</dd></div>
        <div><dt>EMAIL</dt><dd className="acct-email">{me.email}</dd></div>
      </dl>
      <form className="auth-form inline" onSubmit={change}>
        <div className="label">CHANGE PASSWORD</div>
        <div className="field-row">
          <label className="field"><span>New password</span><input id="cp-pass" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="new-password" /></label>
          <label className="field"><span>Confirm</span><input id="cp-pass2" type="password" value={c} onChange={(e) => setC(e.target.value)} autoComplete="new-password" /></label>
          <Btn type="submit" size="sm" disabled={busy || !p}>Change password</Btn>
        </div>
        {err && <p className="warn" role="alert">{err}</p>}
      </form>
      <div className="adm-bar"><span className="fine">Your progress is saved to this account on the server.</span><span className="spacer" /><Btn variant="ghost" size="sm" sound="back" onClick={async () => { await account.logout(); toast('Logged out — log back in any time to continue') }}>Log out</Btn></div>
    </section>
  )
}
