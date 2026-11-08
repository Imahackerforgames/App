import { useEffect, useState } from 'react'
import { Btn } from '../components/ui.jsx'
import { THEMES, usePref } from '../lib/prefs.js'
import { play, isMuted, setMuted, onMuteChange } from '../lib/sound.js'

export default function Settings() {
  const [theme, setTheme] = usePref('theme')
  const [crt, setCrt] = usePref('crt')
  const [muted, setM] = useState(isMuted())
  useEffect(() => onMuteChange(setM), [])

  return (
    <div className="page settings">
      <header className="page-head"><h1 className="page-title"><span className="pt-icon">⚙</span> SETTINGS</h1></header>

      <section className="window">
        <div className="panel-title">THEME</div>
        <div className="theme-grid" role="radiogroup" aria-label="Colour theme">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={theme === t.id} className={`theme-opt ${theme === t.id ? 'on' : ''}`}
              onMouseEnter={() => play('hover')} onClick={() => { play('click'); setTheme(t.id) }}
              style={{ '--s0': t.swatch[0], '--s1': t.swatch[1], '--s2': t.swatch[2], '--s3': t.swatch[3] }}>
              <span className="theme-prev" aria-hidden="true">
                <span className="tp-bar" />
                <span className="tp-body"><i /><i /><b /></span>
              </span>
              <span className="theme-name">{t.name}</span>
              <span className="theme-blurb">{t.blurb}</span>
              {theme === t.id && <span className="theme-check">✓ ACTIVE</span>}
            </button>
          ))}
        </div>
        <p className="fine">Themes change the interface only. Card rarity colours and your artwork always look the same.</p>
      </section>

      <section className="window">
        <div className="panel-title">DISPLAY &amp; SOUND</div>
        <div className="set-rows">
          <div className="set-row">
            <div><b>Sound effects</b><div className="fine">Menu blips, pack opening and reveal sounds.</div></div>
            <Btn variant={muted ? 'ghost' : 'primary'} size="sm" onClick={() => setMuted(!muted)}>{muted ? 'OFF' : 'ON'}</Btn>
          </div>
          <div className="set-row">
            <div><b>CRT effect</b><div className="fine">Scanlines, screen vignette and the moving grid in the background.</div></div>
            <Btn variant={crt === 'off' ? 'ghost' : 'primary'} size="sm" onClick={() => setCrt(crt === 'off' ? 'on' : 'off')}>{crt === 'off' ? 'OFF' : 'ON'}</Btn>
          </div>
        </div>
      </section>
    </div>
  )
}
