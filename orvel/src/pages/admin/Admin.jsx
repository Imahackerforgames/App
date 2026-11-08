import { useCallback, useEffect, useMemo, useState } from 'react'
import CardsAdmin from './CardsAdmin.jsx'
import CardFrame from '../../components/Card.jsx'
import PackArt, { EMBLEM_IDS } from '../../components/PackArt.jsx'
import { Btn, Modal, RarityTag, WindowTitle, ask } from '../../components/ui.jsx'
import { useGame, server, fmt } from '../../store.jsx'
import { packOdds, packExpectedValue } from '../../server/game.js'
import { images, wipeEverything } from '../../lib/storage.js'

const TABS = [
  ['cards', 'Cards'], ['rarities', 'Rarities'], ['packs', 'Packs'], ['collections', 'Collections'],
  ['ranks', 'Ranks'], ['settings', 'Settings'], ['orders', 'Orders'],
]

export default function Admin() {
  const { adminToken, setAdminToken, snap } = useGame()
  if (!adminToken) return <AdminGate configured={snap.adminConfigured} onToken={setAdminToken} />
  return <AdminDash token={adminToken} onLogout={() => { server.adminLogout(adminToken); setAdminToken(null) }} />
}

function AdminGate({ configured, onToken }) {
  const { call } = useGame()
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [err, setErr] = useState('')
  async function submit(e) {
    e.preventDefault(); setErr('')
    if (!configured && pin !== pin2) return setErr('The two PINs do not match')
    try {
      const r = await call((s) => (configured ? s.adminLogin(pin) : s.adminSetup(pin)))
      onToken(r.token)
    } catch (e2) { setErr(e2.message) }
  }
  return (
    <div className="page admin-gate">
      <form className="window gate" onSubmit={submit}>
        <WindowTitle>CREATOR ACCESS</WindowTitle>
        <div className="modal-body">
          <p>{configured ? 'Enter your admin PIN.' : 'First visit: choose an admin PIN. You will need it every time you open the dashboard.'}</p>
          <label className="field"><span>PIN</span><input type="password" value={pin} onChange={(e) => setPin(e.target.value)} autoFocus autoComplete={configured ? 'current-password' : 'new-password'} /></label>
          {!configured && <label className="field"><span>Confirm PIN</span><input type="password" value={pin2} onChange={(e) => setPin2(e.target.value)} autoComplete="new-password" /></label>}
          {err && <p className="warn">{err}</p>}
          <Btn type="submit">{configured ? 'Unlock' : 'Set PIN'}</Btn>
          <p className="fine">Prototype note: this PIN guards the dashboard in this browser. In production, admin access is enforced by the server with a real account and role check (see docs/PRODUCTION.md).</p>
        </div>
      </form>
    </div>
  )
}

function AdminDash({ token, onLogout }) {
  const { call, toast } = useGame()
  const [tab, setTab] = useState(() => sessionStorage.getItem('orvel:admtab') || 'cards')
  const [data, setData] = useState(null)
  const reload = useCallback(async () => setData(await server.adminSnapshot(token)), [token])
  useEffect(() => { reload().catch(onLogout) }, [reload])
  useEffect(() => { sessionStorage.setItem('orvel:admtab', tab) }, [tab])

  // Every admin write goes through the server with the session token, then
  // both the admin view and the player view are refreshed.
  const run = useCallback(async (fn, opts) => { const r = await call((s) => fn(s, token), opts); await reload(); return r }, [call, token, reload])

  if (!data) return <div className="page"><p className="mono blink">LOADING…</p></div>
  const props = { data, run, toast, token }
  return (
    <div className="page admin">
      <header className="page-head">
        <h1 className="page-title"><span className="pt-icon">⚙</span> CREATOR DASHBOARD</h1>
        <Btn variant="ghost" size="sm" sound="back" onClick={onLogout}>Lock</Btn>
      </header>
      <nav className="adm-tabs" role="tablist">
        {TABS.map(([id, l]) => <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{l}</button>)}
      </nav>
      <div className="adm-body">
        {tab === 'cards' && <CardsAdmin {...props} />}
        {tab === 'rarities' && <RaritiesAdmin {...props} />}
        {tab === 'packs' && <PacksAdmin {...props} />}
        {tab === 'collections' && <CollectionsAdmin {...props} />}
        {tab === 'ranks' && <RanksAdmin {...props} />}
        {tab === 'settings' && <SettingsAdmin {...props} />}
        {tab === 'orders' && <OrdersAdmin {...props} />}
      </div>
    </div>
  )
}

// ───────────────────────── rarities ─────────────────────────
function RaritiesAdmin({ data, run, toast }) {
  const [rows, setRows] = useState(() => data.rarities.map((r) => ({ ...r })))
  const total = rows.reduce((t, r) => t + (Number(r.weight) || 0), 0)
  const set = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const move = (i, d) => setRows((rs) => { const n = [...rs]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); return n })
  const sample = data.cards.find((c) => c.published) || data.cards[0]
  const dirty = JSON.stringify(rows) !== JSON.stringify(data.rarities)

  return (
    <div>
      <p className="muted">Order runs from most common (top) to rarest (bottom). Drop weights are relative — the percentage column shows what they work out to. Individual packs can override these weights.</p>
      <div className="rar-list">
        {rows.map((r, i) => (
          <div key={r.id} className="window rar-row">
            <div className="rar-prev">{sample && <CardFrame card={sample} rarity={r} size="xs" tilt={false} showCount={false} />}</div>
            <div className="rar-fields">
              <div className="field-row">
                <label className="field"><span>Tier {i + 1} name</span><input value={r.name} onChange={(e) => set(i, 'name', e.target.value)} maxLength={30} /></label>
                <label className="field"><span>Effect &amp; reveal</span>
                  <select value={r.effect} onChange={(e) => set(i, 'effect', e.target.value)}>
                    {data.effects.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                  </select>
                </label>
                <label className="field color"><span>Colour</span><input type="color" value={r.color} onChange={(e) => set(i, 'color', e.target.value)} /></label>
                <label className="field color"><span>Shade</span><input type="color" value={r.color2} onChange={(e) => set(i, 'color2', e.target.value)} /></label>
              </div>
              <div className="field-row">
                <label className="field"><span>Drop weight</span><input type="number" min="0" step="any" value={r.weight} onChange={(e) => set(i, 'weight', e.target.value)} /></label>
                <div className="field"><span>Base odds</span><div className="mono pct">{total ? ((Number(r.weight) || 0) / total * 100).toFixed(2) : 0}%</div></div>
                <label className="field"><span>Lowest value</span><input type="number" min="0" step="1" value={r.minValue ?? r.sellValue} onChange={(e) => set(i, 'minValue', e.target.value)} /></label>
                <label className="field"><span>Highest value</span><input type="number" min="0" step="1" value={r.maxValue ?? r.sellValue} onChange={(e) => set(i, 'maxValue', e.target.value)} /></label>
                <label className="field"><span>Default value</span><input type="number" min="0" step="1" value={r.sellValue} onChange={(e) => set(i, 'sellValue', e.target.value)} /></label>
                <label className="field"><span>XP per pull</span><input type="number" min="0" step="1" value={r.xp} onChange={(e) => set(i, 'xp', e.target.value)} /></label>
              </div>
            </div>
            <div className="rar-order">
              <button disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">▲</button>
              <button disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">▼</button>
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove rarity" title="Remove">✕</button>
            </div>
          </div>
        ))}
      </div>
      <div className="adm-bar">
        <Btn variant="ghost" onClick={() => setRows([...rows, { id: 'r_' + Date.now().toString(36), name: `Tier ${rows.length + 1}`, weight: 1, sellValue: 10, minValue: 10, maxValue: 10, xp: 5, color: '#cccccc', color2: '#333333', effect: 'matte' }])}>+ Add rarity</Btn>
        <span className="spacer" />
        {dirty && <Btn variant="ghost" onClick={() => setRows(data.rarities.map((r) => ({ ...r })))}>Revert</Btn>}
        <Btn disabled={!dirty} onClick={() => run((s, tk) => s.saveRarities(tk, rows.map((r) => ({ ...r, weight: Number(r.weight), sellValue: Number(r.sellValue), minValue: Number(r.minValue ?? r.sellValue), maxValue: Number(r.maxValue ?? r.sellValue), xp: Number(r.xp) })))).then(() => toast('Rarities saved')).catch(() => {})}>Save rarities</Btn>
      </div>
    </div>
  )
}

// ───────────────────────── packs ─────────────────────────
function PacksAdmin({ data, run, toast }) {
  const [edit, setEdit] = useState(null)
  return (
    <div>
      <div className="adm-bar"><Btn onClick={() => setEdit(newPack(data))}>+ New pack</Btn></div>
      <div className="pack-adm-grid">
        {data.packs.map((p) => (
          <div key={p.id} className={`window pack-adm ${p.active ? '' : 'pack-off'}`}>
            <PackArt pack={p} size="sm" />
            <div>
              <h3>{p.name}</h3>
              <div className="mono muted">{p.priceCash != null ? `${fmt(p.priceCash)} cash` : '—'} · {p.priceUsd != null ? `$${p.priceUsd}` : 'no $'} · {p.cardCount} cards</div>
              {p.priceCash != null && <EvLine ev={p.ev} price={p.priceCash} />}
              <div className="tags">
                {!p.active && <span className="pill">HIDDEN</span>}
                {p.featured && <span className="pill on">FEATURED</span>}
                {p.premium && <span className="pill on">PREMIUM</span>}
                {p.limited.enabled && <span className="pill on">LTD {p.limited.sold}/{p.limited.stock}</span>}
              </div>
              {!p.status.ok && <p className="warn small">{p.status.reason}</p>}
              <Btn size="sm" variant="ghost" onClick={() => setEdit(structuredClone(p))}>Edit</Btn>
            </div>
          </div>
        ))}
      </div>
      {edit && <PackEditor pack={edit} data={data} run={run} toast={toast} onClose={() => setEdit(null)} />}
    </div>
  )
}

function newPack(data) {
  return { name: '', tagline: '', description: '', priceCash: 200, priceUsd: '', cardCount: 5, poolMode: 'all', rarityWeights: null, guarantee: null, active: false, featured: false, premium: false, limited: { enabled: false, stock: 1000, sold: 0, endsAt: null }, design: { c1: '#1a1040', c2: '#ff5cf0', c3: '#ffffff', emblem: 'orb' }, sort: data.packs.length + 1 }
}

function PackEditor({ pack, data, run, toast, onClose }) {
  const [p, setP] = useState(pack)
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }))
  const setD = (k, v) => setP((x) => ({ ...x, design: { ...x.design, [k]: v } }))
  const setL = (k, v) => setP((x) => ({ ...x, limited: { ...x.limited, [k]: v } }))
  const odds = useMemo(() => packOdds({ rarities: data.rarities, cards: data.cards }, { ...p, cardCount: Number(p.cardCount) || 1 }), [p, data])
  const ev = useMemo(() => packExpectedValue({ rarities: data.rarities, cards: data.cards }, { ...p, cardCount: Number(p.cardCount) || 1 }), [p, data])
  const tagged = data.cards.filter((c) => (c.packIds || []).includes(p.id)).length

  async function save() {
    try { await run((s, tk) => s.upsertPack(tk, p)); toast('Pack saved'); onClose() } catch {}
  }
  async function del() {
    if (!(await ask(`Delete the pack "${p.name}"? Players keep every card they already pulled from it.`, { ok: 'Delete pack', danger: true }))) return
    await run((s, tk) => s.deletePack(tk, p.id)); toast('Pack deleted'); onClose()
  }

  return (
    <Modal onClose={onClose} wide label="Pack editor">
      <WindowTitle onClose={onClose}>{p.id ? 'EDIT PACK' : 'NEW PACK'}</WindowTitle>
      <div className="editor">
        <div className="editor-preview">
          <PackArt pack={{ ...p, name: p.name || 'New Pack', cardCount: p.cardCount }} size="lg" />
          <div className="field-row">
            <label className="field color"><span>Base</span><input type="color" value={p.design.c1} onChange={(e) => setD('c1', e.target.value)} /></label>
            <label className="field color"><span>Foil</span><input type="color" value={p.design.c2} onChange={(e) => setD('c2', e.target.value)} /></label>
            <label className="field color"><span>Ink</span><input type="color" value={p.design.c3} onChange={(e) => setD('c3', e.target.value)} /></label>
            <label className="field"><span>Emblem</span>
              <select value={p.design.emblem} onChange={(e) => setD('emblem', e.target.value)}>{EMBLEM_IDS.map((x) => <option key={x}>{x}</option>)}</select>
            </label>
          </div>
          <table className="odds small">
            <thead><tr><th>Rarity</th><th>Per card</th>{odds.guaranteed && <th>Last card</th>}</tr></thead>
            <tbody>{odds.standard.map((o, i) => <tr key={o.rarityId}><td>{o.name}</td><td className="mono">{o.pct.toFixed(2)}%</td>{odds.guaranteed && <td className="mono">{odds.guaranteed.odds[i].pct.toFixed(2)}%</td>}</tr>)}</tbody>
          </table>
          <p className="fine">Effective odds from {odds.poolSize} eligible published cards — exactly what players will see.</p>
          {p.priceCash != null && <EvLine ev={ev} price={Number(p.priceCash)} long />}
        </div>
        <div className="editor-form">
          <label className="field"><span>Name *</span><input value={p.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="field"><span>Tagline</span><input value={p.tagline} onChange={(e) => set('tagline', e.target.value)} /></label>
          <label className="field"><span>Description</span><textarea rows={2} value={p.description} onChange={(e) => set('description', e.target.value)} /></label>
          <div className="field-row">
            <label className="field"><span>Price (in-game)</span><input type="number" min="0" placeholder="blank = not sold for Cash" value={p.priceCash ?? ''} onChange={(e) => set('priceCash', e.target.value === '' ? null : Number(e.target.value))} /></label>
            <label className="field"><span>Price (USD)</span><input type="number" min="0" step="0.01" placeholder="blank = not sold for $" value={p.priceUsd ?? ''} onChange={(e) => set('priceUsd', e.target.value === '' ? null : e.target.value)} /></label>
            <label className="field"><span>Cards per pack</span><input type="number" min="1" max="20" value={p.cardCount} onChange={(e) => set('cardCount', Number(e.target.value))} /></label>
          </div>
          <div className="field"><span>Card pool</span>
            <div className="seg">
              <button type="button" className={p.poolMode === 'all' ? 'on' : ''} onClick={() => set('poolMode', 'all')}>Every published card</button>
              <button type="button" className={p.poolMode === 'tagged' ? 'on' : ''} onClick={() => set('poolMode', 'tagged')}>Only cards assigned to this pack ({tagged})</button>
            </div>
          </div>
          <label className="field"><span>Guaranteed last card</span>
            <select value={p.guarantee?.minRarityId || ''} onChange={(e) => set('guarantee', e.target.value ? { minRarityId: e.target.value } : null)}>
              <option value="">No guarantee</option>
              {data.rarities.map((r) => <option key={r.id} value={r.id}>{r.name} or better</option>)}
            </select>
          </label>
          <fieldset className="field"><legend>Drop rates</legend>
            <label className="check"><input type="checkbox" checked={!!p.rarityWeights} onChange={(e) => set('rarityWeights', e.target.checked ? Object.fromEntries(data.rarities.map((r) => [r.id, r.weight])) : null)} /><span>Use custom weights for this pack</span></label>
            {p.rarityWeights && (
              <div className="weights">
                {data.rarities.map((r) => (
                  <label key={r.id} className="field inline"><RarityTag rarity={r} />
                    <input type="number" min="0" step="any" value={p.rarityWeights[r.id] ?? 0} onChange={(e) => set('rarityWeights', { ...p.rarityWeights, [r.id]: e.target.value })} />
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset className="field"><legend>Availability</legend>
            <div className="checks">
              <label className="check"><input type="checkbox" checked={p.active} onChange={(e) => set('active', e.target.checked)} /><span>On sale</span></label>
              <label className="check"><input type="checkbox" checked={p.featured} onChange={(e) => set('featured', e.target.checked)} /><span>Featured</span></label>
              <label className="check"><input type="checkbox" checked={p.premium} onChange={(e) => set('premium', e.target.checked)} /><span>Premium styling</span></label>
              <label className="check"><input type="checkbox" checked={p.limited.enabled} onChange={(e) => setL('enabled', e.target.checked)} /><span>Limited edition</span></label>
            </div>
            {p.limited.enabled && (
              <div className="field-row">
                <label className="field"><span>Stock</span><input type="number" min="0" value={p.limited.stock} onChange={(e) => setL('stock', e.target.value)} /></label>
                <label className="field"><span>Sold</span><div className="mono pct">{p.limited.sold}</div></label>
                <label className="field"><span>Ends (optional)</span><input type="date" value={p.limited.endsAt ? p.limited.endsAt.slice(0, 10) : ''} onChange={(e) => setL('endsAt', e.target.value ? e.target.value + 'T23:59:59' : null)} /></label>
              </div>
            )}
            <label className="field inline"><span>Shop order</span><input type="number" value={p.sort} onChange={(e) => set('sort', e.target.value)} /></label>
          </fieldset>
          <div className="editor-btns">
            {p.id && <Btn variant="danger" size="sm" onClick={del}>Delete</Btn>}
            <span className="spacer" />
            <Btn variant="ghost" sound="back" onClick={onClose}>Cancel</Btn>
            <Btn onClick={save}>Save pack</Btn>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ───────────────────────── collections ─────────────────────────
function CollectionsAdmin({ data, run, toast }) {
  const [draft, setDraft] = useState({ name: '', description: '' })
  return (
    <div>
      <p className="muted">Themed collections group cards for players to browse and filter. Assign cards to them in each card's editor.</p>
      <div className="col-list">
        {data.collections.map((c) => <CollectionRow key={c.id} col={c} count={data.cards.filter((x) => (x.collectionIds || []).includes(c.id)).length} run={run} toast={toast} />)}
      </div>
      <form className="window col-new" onSubmit={(e) => { e.preventDefault(); run((s, tk) => s.upsertCollection(tk, draft)).then(() => { toast('Collection created'); setDraft({ name: '', description: '' }) }).catch(() => {}) }}>
        <div className="panel-title">NEW COLLECTION</div>
        <div className="field-row">
          <label className="field"><span>Name</span><input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
          <label className="field grow"><span>Description</span><input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
          <Btn type="submit">Create</Btn>
        </div>
      </form>
    </div>
  )
}
function CollectionRow({ col, count, run, toast }) {
  const [c, setC] = useState(col)
  const dirty = c.name !== col.name || c.description !== col.description
  return (
    <div className="window col-row field-row">
      <label className="field"><span>Name</span><input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></label>
      <label className="field grow"><span>Description</span><input value={c.description} onChange={(e) => setC({ ...c, description: e.target.value })} /></label>
      <span className="mono muted">{count} cards</span>
      {dirty && <Btn size="sm" onClick={() => run((s, tk) => s.upsertCollection(tk, c)).then(() => toast('Saved')).catch(() => {})}>Save</Btn>}
      <Btn size="sm" variant="danger" onClick={async () => (await ask(`Delete "${col.name}"? Cards stay; they just leave this collection.`, { ok: 'Delete', danger: true })) && run((s, tk) => s.deleteCollection(tk, col.id))}>Delete</Btn>
    </div>
  )
}

// ───────────────────────── ranks ─────────────────────────
function RanksAdmin({ data, run, toast }) {
  const [rows, setRows] = useState(() => data.ranks.map((r) => ({ ...r })))
  const [xp, setXp] = useState({ ...data.xpRules })
  const set = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  return (
    <div>
      <p className="muted">Ranks track dedication and are separate from card rarity. Rename them whenever the official names are ready; XP thresholds must rise from rank to rank.</p>
      <div className="window rank-adm">
        {rows.map((r, i) => (
          <div key={r.id} className="field-row">
            <span className="rank-badge sm" data-tier={i}><span>{i + 1}</span></span>
            <label className="field grow"><span>Label</span><input value={r.label} onChange={(e) => set(i, 'label', e.target.value)} maxLength={30} /></label>
            <label className="field"><span>XP needed</span><input type="number" min="0" value={r.xp} disabled={i === 0} onChange={(e) => set(i, 'xp', Number(e.target.value))} /></label>
            {i > 0 && <button className="icon-btn" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Remove rank">✕</button>}
          </div>
        ))}
        <Btn variant="ghost" size="sm" onClick={() => setRows([...rows, { id: 'rank_' + Date.now().toString(36), label: `Rank ${rows.length + 1}`, xp: (rows[rows.length - 1]?.xp || 0) * 2 || 100 }])}>+ Add rank</Btn>
      </div>
      <div className="window">
        <div className="panel-title">XP REWARDS</div>
        <div className="field-row">
          <label className="field"><span>Per pack opened</span><input type="number" min="0" value={xp.perPack} onChange={(e) => setXp({ ...xp, perPack: Number(e.target.value) })} /></label>
          <label className="field"><span>Per new card discovered</span><input type="number" min="0" value={xp.perNewCard} onChange={(e) => setXp({ ...xp, perNewCard: Number(e.target.value) })} /></label>
          <label className="field"><span>Per card sold</span><input type="number" min="0" value={xp.perSale} onChange={(e) => setXp({ ...xp, perSale: Number(e.target.value) })} /></label>
        </div>
        <p className="fine">Each card pulled also grants its rarity's “XP per pull” (Rarities tab).</p>
      </div>
      <div className="adm-bar"><span className="spacer" /><Btn onClick={() => run((s, tk) => s.saveRanks(tk, rows, xp)).then(() => toast('Ranks saved')).catch(() => {})}>Save ranks</Btn></div>
    </div>
  )
}

// ───────────────────────── settings ─────────────────────────
function SettingsAdmin({ data, run, toast, token }) {
  const [s, setS] = useState({ ...data.settings })
  const [grant, setGrant] = useState(500)
  const [busy, setBusy] = useState('')

  async function exportCatalog() {
    setBusy('export')
    try {
      const cat = await server.exportCatalog(token)
      const imgs = {}
      for (const c of cat.cards) if (c.imageKey && !imgs[c.imageKey]) {
        const blob = await images.get(c.imageKey)
        if (blob) imgs[c.imageKey] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob) })
      }
      const blob = new Blob([JSON.stringify({ ...cat, images: imgs })], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob); a.download = `orvel-catalog-${new Date().toISOString().slice(0, 10)}.json`; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      toast(`Exported ${cat.cards.length} cards`)
    } finally { setBusy('') }
  }
  async function importCatalog(file) {
    if (!file) return
    setBusy('import')
    try {
      const json = JSON.parse(await file.text())
      for (const [key, url] of Object.entries(json.images || {})) {
        const blob = await (await fetch(url)).blob()
        const newKey = await images.put(blob)
        for (const c of json.cards) if (c.imageKey === key) c.imageKey = newKey
      }
      const r = await run((sv, tk) => sv.importCatalog(tk, json))
      toast(`Imported ${r.cards} cards`)
    } catch (e) { toast(e.message, 'error') } finally { setBusy('') }
  }

  return (
    <div className="settings-adm">
      <div className="window">
        <div className="panel-title">ECONOMY</div>
        <div className="field-row">
          <label className="field"><span>Currency name</span><input value={s.currencyName} onChange={(e) => setS({ ...s, currencyName: e.target.value })} /></label>
          <label className="field"><span>Starting balance</span><input type="number" min="0" value={s.startingCash} onChange={(e) => setS({ ...s, startingCash: Number(e.target.value) })} /></label>
        </div>
        <div className="panel-title">REAL-MONEY PURCHASES</div>
        <label className="check"><input type="checkbox" checked={s.realMoneyEnabled} onChange={(e) => setS({ ...s, realMoneyEnabled: e.target.checked })} /><span>Show real-money prices (simulated checkout in this prototype)</span></label>
        <label className="field inline"><span>Minimum age to confirm</span><input type="number" min="0" value={s.minAge} onChange={(e) => setS({ ...s, minAge: Number(e.target.value) })} /></label>
        <div className="adm-bar"><span className="spacer" /><Btn onClick={() => run((sv, tk) => sv.saveSettings(tk, s)).then(() => toast('Settings saved')).catch(() => {})}>Save settings</Btn></div>
      </div>

      <div className="window">
        <div className="panel-title">BACKUP</div>
        <p className="muted">Everything in this prototype is stored in this browser. Export regularly — the file includes your original artwork at full resolution.</p>
        <div className="adm-bar">
          <Btn variant="ghost" onClick={exportCatalog} disabled={!!busy}>{busy === 'export' ? 'Exporting…' : '⇩ Export catalog'}</Btn>
          <label className="btn btn-ghost"><span className="btn-in">{busy === 'import' ? 'Importing…' : '⇧ Import catalog'}</span>
            <input type="file" accept="application/json" hidden onChange={(e) => { importCatalog(e.target.files[0]); e.target.value = '' }} />
          </label>
        </div>
      </div>

      <div className="window">
        <div className="panel-title">TEST TOOLS</div>
        <div className="field-row">
          <label className="field"><span>Adjust player balance</span><input type="number" value={grant} onChange={(e) => setGrant(Number(e.target.value))} /></label>
          <Btn variant="ghost" onClick={() => run((sv, tk) => sv.adminGrantCash(tk, grant)).then((r) => toast(`Balance is now ${fmt(r.cash)}`)).catch(() => {})}>Apply</Btn>
        </div>
        <div className="adm-bar">
          <Btn variant="danger" onClick={async () => (await ask('Reset the player: balance, cards, rank and history? The catalog is kept.', { ok: 'Reset player', danger: true })) && run((sv, tk) => sv.adminResetPlayer(tk)).then(() => toast('Player reset'))}>Reset player progress</Btn>
          <Btn variant="danger" onClick={async () => { if (await ask('Erase EVERYTHING in this browser — catalog, artwork, player, PIN? Export first if you want to keep it.', { ok: 'Erase everything', danger: true })) { await wipeEverything(); location.reload() } }}>Erase all data</Btn>
        </div>
      </div>
    </div>
  )
}

function OrdersAdmin({ data }) {
  return (
    <div className="window">
      <div className="panel-title">REAL-MONEY ORDERS (SIMULATED)</div>
      {!data.orders.length ? <p className="muted">No orders yet.</p> : (
        <div className="txs">
          {data.orders.map((o) => (
            <div key={o.id} className="tx">
              <span className="tx-time mono">{new Date(o.createdAt).toLocaleString()}</span>
              <span className="tx-what">{o.packName} <span className="muted mono">{o.id}</span></span>
              <span className={`pill ${o.status === 'fulfilled' ? 'on' : ''}`}>{o.status.toUpperCase()}</span>
              <span className="tx-amt mono">${o.amountUsd.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Average sell-back value of one pack against its price. Above 100% means
// buying and selling packs creates coins out of nothing.
function EvLine({ ev, price, long }) {
  const pct = price > 0 ? (ev / price) * 100 : Infinity
  const level = pct >= 100 ? 'bad' : pct >= 85 ? 'warn' : 'ok'
  return (
    <div className={`ev ev-${level}`}>
      <span className="mono">Avg. sell-back {fmt(Math.round(ev))} · {Number.isFinite(pct) ? Math.round(pct) : '∞'}% of price</span>
      {long && level === 'bad' && <span>Players earn more selling these cards than the pack costs, so they can farm unlimited coins. Raise the price or lower the top rarities' odds.</span>}
      {long && level === 'warn' && <span>Close to break-even. Most games keep this around 50–70%.</span>}
      {long && level === 'ok' && <span>Players get back less than they spend on average; big pulls still pay off.</span>}
    </div>
  )
}
