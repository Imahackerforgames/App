import { useMemo, useRef, useState } from 'react'
import CardFrame from '../components/Card.jsx'
import { Btn, Cash, Modal, WindowTitle, ask } from '../components/ui.jsx'
import { useGame, fmt, go } from '../store.jsx'
import { customDisplay, sceneArt } from '../lib/customCard.js'
import { images } from '../lib/storage.js'
import { CLOUD, uploadImage, myUserId } from '../lib/cloud.js'
import { FORGE, FRAMES, CARD_EFFECTS, ELEMENTS, ABILITIES, ART_SCENES, ART_PALETTES } from '../server/battle.js'
import { play } from '../lib/sound.js'

const PALETTE_SWATCH = { nocturne: '#3d4fa8', ember: '#e0503a', signal: '#1fa38a', void: '#7b2ff7', dawn: '#d06aa8' }

export default function Forge() {
  const { snap, call, toast } = useGame()
  const [edit, setEdit] = useState(null)
  const customs = snap.player.customs

  async function upgrade(c) {
    const cost = FORGE.upgradeCost(c.level)
    if (!(await ask(`Upgrade ${c.name} to level ${c.level + 1} for ${fmt(cost)} coins? It gets ${FORGE.budget(c.level + 1)} stat points${c.level + 1 === FORGE.secondAbilityLevel ? ' and a second ability slot' : ''}.`, { ok: 'Upgrade' }))) return
    try { await call((s) => s.upgradeCustom(c.id)); play('cash'); toast(`${c.name} is now level ${c.level + 1} — spend the new points in Edit`) } catch {}
  }
  async function remove(c) {
    if (!(await ask(`Scrap ${c.name}? Upgrades are not refunded.`, { ok: 'Scrap card', danger: true }))) return
    try { const r = await call((s) => s.deleteCustom(c.id)); if (r.imageKey && !CLOUD) images.remove(r.imageKey) } catch {}
  }

  return (
    <div className="page forge">
      <header className="page-head">
        <h1 className="page-title"><span className="pt-icon">⚒</span> FORGE</h1>
        <div className="wallet window"><span className="label">WALLET</span><Cash amount={snap.player.cash} big /></div>
      </header>
      <p className="muted">Design your own card: its art, frame, effect, element, abilities and stats. Forge cards fight in the Arena and level up with coins. They can't be sold or bet.</p>

      <div className="forge-grid">
        {customs.map((c) => {
          const d = customDisplay(c)
          const used = c.atk + c.def, budget = FORGE.budget(c.level)
          return (
            <div key={c.id} className="window forge-item">
              <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="md" showCount={false} stats={c} />
              <div className="fi-info">
                <b>{c.name}</b>
                <span className="mono muted">Level {c.level}/{FORGE.maxLevel} · {used}/{budget} points{used < budget ? ' — unspent!' : ''}</span>
              </div>
              <div className="fi-btns">
                <Btn size="sm" variant="ghost" onClick={() => setEdit({ ...c, art: { ...c.art }, abilities: [...c.abilities] })}>Edit</Btn>
                {c.level < FORGE.maxLevel
                  ? <Btn size="sm" variant="sell" onClick={() => upgrade(c)}>Upgrade · {fmt(FORGE.upgradeCost(c.level))}</Btn>
                  : <span className="pill on">MAX LEVEL</span>}
                <button className="link" onClick={() => remove(c)}>Scrap</button>
              </div>
            </div>
          )
        })}
        {customs.length < FORGE.maxCards && (
          <button className="window forge-new" onClick={() => { play('click'); setEdit(blank()) }}>
            <span className="fn-plus">+</span><span>Forge a new card</span><span className="fine">{customs.length}/{FORGE.maxCards} slots used · free to create</span>
          </button>
        )}
      </div>

      {edit && <ForgeEditor initial={edit} onClose={() => setEdit(null)} />}
    </div>
  )
}

const blank = () => ({
  name: '', atk: 5, def: 5, level: 1, element: 'ember', abilities: [], frame: 'basic', effect: 'matte', accent: '#39ff88', fit: 'contain',
  art: { kind: 'scene', scene: 'hills', palette: 'nocturne', seed: Math.random().toString(36).slice(2, 8) },
})

function ForgeEditor({ initial, onClose }) {
  const { snap, call, toast } = useGame()
  const [c, setC] = useState(initial)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }))
  const setArt = (k, v) => setC((x) => ({ ...x, art: { ...x.art, kind: 'scene', [k]: v } }))
  const d = useMemo(() => customDisplay(c), [c])
  const budget = FORGE.budget(c.level || 1)
  const left = budget - c.atk - c.def
  const slots = (c.level || 1) >= FORGE.secondAbilityLevel ? 2 : 1
  const owned = snap.player.cosmetics

  async function upload(f) {
    if (!f) return
    if (!f.type.startsWith('image/')) return toast('Choose an image file', 'error')
    if (f.size > 8 * 1024 * 1024) return toast('Images for Forge cards can be up to 8 MB', 'error')
    try {
      const imageKey = CLOUD ? await uploadImage('forge', f, await myUserId()) : await images.put(f)
      setC((x) => ({ ...x, art: { kind: 'upload', imageKey } }))
    } catch (e) { toast(e.message, 'error') }
  }
  async function save() {
    setBusy(true)
    try { await call((s) => s.saveCustom(c)); play('cash'); toast(`${c.name} saved`); onClose() } catch {} finally { setBusy(false) }
  }
  const stat = (k, delta) => {
    const v = c[k] + delta
    if (v < 1 || (delta > 0 && left <= 0)) return
    play('hover'); set(k, v)
  }
  const setAbility = (slot, id) => {
    const a = [...c.abilities]
    a[slot] = id
    set('abilities', a.filter(Boolean).slice(0, slots))
  }

  return (
    <Modal onClose={onClose} wide label="Forge editor">
      <WindowTitle onClose={onClose}>{c.id ? `EDIT · ${c.name}` : 'FORGE A CARD'}</WindowTitle>
      <div className="editor">
        <div className="editor-preview">
          <CardFrame card={d.card} rarity={d.rarity} frame={d.frame} footRight={d.footRight} size="lg" showCount={false} stats={c} />
        </div>
        <div className="editor-form">
          <label className="field"><span>Card name</span><input value={c.name} maxLength={24} onChange={(e) => set('name', e.target.value)} placeholder="Name your card" /></label>

          <fieldset className="field"><legend>Artwork</legend>
            <div className="chips">{ART_SCENES.map((sc) => <button key={sc} type="button" className={`chip ${c.art.kind === 'scene' && c.art.scene === sc ? 'on' : ''}`} onClick={() => setArt('scene', sc)}>{sc}</button>)}</div>
            <div className="swatches">
              {ART_PALETTES.map((p) => <button key={p} type="button" className={`swatch ${c.art.kind === 'scene' && c.art.palette === p ? 'on' : ''}`} style={{ background: PALETTE_SWATCH[p] }} onClick={() => setArt('palette', p)} aria-label={`${p} colours`} title={p} />)}
              <Btn size="sm" variant="ghost" onClick={() => setC((x) => ({ ...x, art: { kind: 'scene', scene: x.art.scene || 'hills', palette: x.art.palette || 'nocturne', seed: Math.random().toString(36).slice(2, 8) } }))}>⟳ Shuffle</Btn>
              <Btn size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>⇪ Upload my own</Btn>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
            </div>
          </fieldset>

          <fieldset className="field"><legend>Frame</legend>
            <div className="shop-items">{FRAMES.map((f) => <Cosmetic key={f.id} kind="frame" item={f} owned={owned.frames.includes(f.id)} on={c.frame === f.id} onPick={() => set('frame', f.id)} />)}</div>
          </fieldset>
          <fieldset className="field"><legend>Effect</legend>
            <div className="shop-items">{CARD_EFFECTS.map((f) => <Cosmetic key={f.id} kind="effect" item={f} owned={owned.effects.includes(f.id)} on={c.effect === f.id} onPick={() => set('effect', f.id)} />)}</div>
          </fieldset>
          <label className="field inline"><span>Accent colour</span><input type="color" value={c.accent} onChange={(e) => set('accent', e.target.value)} /></label>

          <fieldset className="field"><legend>Element</legend>
            <div className="seg">{ELEMENTS.map((e) => <button key={e.id} type="button" className={c.element === e.id ? 'on' : ''} onClick={() => set('element', e.id)}><span style={{ color: c.element === e.id ? undefined : e.color }}>{e.glyph}</span> {e.name}</button>)}</div>
            <span className="fine">Ember beats Gale, Gale beats Tide, Tide beats Ember (+3 ATK).</span>
          </fieldset>

          <fieldset className="field"><legend>Abilities · {slots} slot{slots > 1 ? 's' : ''}{slots < 2 ? ` (second unlocks at level ${FORGE.secondAbilityLevel})` : ''}</legend>
            {Array.from({ length: slots }, (_, k) => (
              <select key={k} value={c.abilities[k] || ''} onChange={(e) => setAbility(k, e.target.value)} aria-label={`Ability ${k + 1}`}>
                <option value="">No ability</option>
                {ABILITIES.filter((a) => a.id === c.abilities[k] || !c.abilities.includes(a.id)).map((a) => <option key={a.id} value={a.id}>{a.name} — {a.text}</option>)}
              </select>
            ))}
          </fieldset>

          <fieldset className="field"><legend>Stats · {left} of {budget} points left</legend>
            <div className="stat-alloc">
              {[['atk', 'ATK'], ['def', 'DEF']].map(([k, l]) => (
                <div key={k} className="sa-row">
                  <span className="label">{l}</span>
                  <div className="stepper"><button type="button" onClick={() => stat(k, -1)} disabled={c[k] <= 1} aria-label={`Lower ${l}`}>−</button><span className="mono">{c[k]}</span><button type="button" onClick={() => stat(k, 1)} disabled={left <= 0} aria-label={`Raise ${l}`}>+</button></div>
                  <div className="sa-bar"><i style={{ width: `${(c[k] / budget) * 100}%` }} /></div>
                </div>
              ))}
            </div>
            <span className="fine">Level {c.level || 1} cards have {budget} points. Upgrading adds 2 per level, up to {FORGE.budget(FORGE.maxLevel)} at level {FORGE.maxLevel}.</span>
          </fieldset>

          <div className="editor-btns">
            <span className="spacer" />
            <Btn variant="ghost" sound="back" onClick={onClose}>Cancel</Btn>
            <Btn onClick={save} disabled={busy || !c.name.trim()}>{c.id ? 'Save changes' : 'Forge card'}</Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// A frame or effect swatch: pick it if owned, otherwise buy it on the spot.
export function Cosmetic({ kind, item, owned, on, onPick }) {
  const { call, snap } = useGame()
  const preview = useMemo(() => customDisplay({ name: item.name, level: 1, frame: kind === 'frame' ? item.id : 'basic', effect: kind === 'effect' ? item.id : 'matte', accent: '#39ff88', art: { kind: 'scene', scene: 'nebula', palette: 'void', seed: 'shop' } }), [kind, item])
  async function buy() {
    if (!(await ask(`Buy the ${item.name} ${kind} for ${fmt(item.price)} coins?`, { ok: 'Buy' }))) return
    try { await call((s) => s.buyCosmetic(kind, item.id)); play('cash'); onPick?.() } catch {}
  }
  return (
    <div className={`cosm ${on ? 'on' : ''} ${owned ? '' : 'locked'}`}>
      <button type="button" className="cosm-prev" onClick={() => (owned ? (play('click'), onPick?.()) : buy())} aria-label={owned ? `Use ${item.name}` : `Buy ${item.name}`}>
        <CardFrame card={preview.card} rarity={preview.rarity} frame={preview.frame} footRight=" " size="xs" tilt={false} showCount={false} />
      </button>
      <span className="cosm-name">{item.name}</span>
      {owned ? <span className="cosm-owned">{on ? '✓ IN USE' : 'OWNED'}</span>
        : <Btn size="sm" variant={snap.player.cash >= item.price ? 'sell' : 'ghost'} onClick={buy}><Cash amount={item.price} /></Btn>}
    </div>
  )
}
