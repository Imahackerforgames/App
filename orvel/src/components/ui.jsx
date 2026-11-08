import { useEffect } from 'react'
import { play } from '../lib/sound.js'
import { useGame, fmt } from '../store.jsx'

export function Btn({ children, variant = 'primary', size, sound = 'click', onClick, className = '', ...rest }) {
  return (
    <button
      className={`btn btn-${variant} ${size ? 'btn-' + size : ''} ${className}`}
      onMouseEnter={() => play('hover')}
      onClick={(e) => { play(sound); onClick?.(e) }}
      {...rest}
    >
      <span className="btn-in">{children}</span>
    </button>
  )
}

export function Modal({ children, onClose, wide, className = '', label }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') { play('back'); onClose?.() } }
    addEventListener('keydown', k)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', k); document.body.style.overflow = prev }
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) { play('back'); onClose?.() } }}>
      <div className={`modal window ${wide ? 'modal-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  )
}

export function WindowTitle({ children, onClose }) {
  return (
    <div className="win-title">
      <span className="win-dots"><i /><i /><i /></span>
      <span className="win-text">{children}</span>
      {onClose && <button className="win-x" aria-label="Close" onClick={() => { play('back'); onClose() }}>✕</button>}
    </div>
  )
}

export function Cash({ amount, big }) {
  const { snap } = useGame()
  return (
    <span className={`cash ${big ? 'cash-big' : ''}`} title={snap?.settings.currencyName}>
      <span className="coin" aria-hidden="true" />
      <span className="cash-n">{fmt(amount)}</span>
    </span>
  )
}

export function Meter({ value, label, color }) {
  return (
    <div className="meter" style={color ? { '--meter': color } : undefined} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <div className="meter-fill" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
      <div className="meter-ticks" />
    </div>
  )
}

export function RarityTag({ rarity }) {
  if (!rarity) return null
  return <span className={`rtag fx-${rarity.effect}`} style={{ '--c1': rarity.color, '--c2': rarity.color2 }}><i />{rarity.name}</span>
}

export function Toasts() {
  const { toasts } = useGame()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.msg}</div>)}
    </div>
  )
}
