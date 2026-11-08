import { useEffect, useMemo, useRef, useState } from 'react'
import CardFrame from '../../components/Card.jsx'
import { ArtZoom } from '../../components/CardViewer.jsx'
import { Btn, Modal, RarityTag, WindowTitle, ask } from '../../components/ui.jsx'
import { images } from '../../lib/storage.js'
import { fmt } from '../../store.jsx'

const MAX_MB = 40

async function readDims(blob) {
  try {
    const bmp = await createImageBitmap(blob)
    const d = { w: bmp.width, h: bmp.height }; bmp.close?.(); return d
  } catch {
    return await new Promise((res) => {
      const u = URL.createObjectURL(blob), im = new Image()
      im.onload = () => { res({ w: im.naturalWidth, h: im.naturalHeight }); URL.revokeObjectURL(u) }
      im.onerror = () => { res({ w: null, h: null }); URL.revokeObjectURL(u) }
      im.src = u
    })
  }
}

// Stores the original file untouched — no resizing, no recompression.
export async function storeArtwork(file) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`)
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`${file.name} is over ${MAX_MB} MB`)
  const { w, h } = await readDims(file)
  const imageKey = await images.put(file)
  return { imageKey, imageW: w, imageH: h }
}

const nameFromFile = (f) => f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80) || 'Untitled'

export default function CardsAdmin({ data, run, toast }) {
  const [editing, setEditing] = useState(null) // card draft or 'new'
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [rar, setRar] = useState('')
  const [sel, setSel] = useState(new Set())
  const [limit, setLimit] = useState(100)
  const [bulk, setBulk] = useState(null)
  const rarityById = useMemo(() => Object.fromEntries(data.rarities.map((r, i) => [r.id, { ...r, tier: i }])), [data.rarities])

  const list = useMemo(() => {
    const t = q.trim().toLowerCase()
    return data.cards
      .filter((c) => (status === 'all' || (status === 'pub' ? c.published : !c.published)) && (!rar || c.rarityId === rar) &&
        (!t || c.name.toLowerCase().includes(t) || c.code.toLowerCase().includes(t) || String(c.collectionNumber) === t.replace('#', '')))
      .sort((a, b) => a.collectionNumber - b.collectionNumber)
  }, [data.cards, q, status, rar])

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSel = list.length > 0 && list.every((c) => sel.has(c.id))
  const samples = data.cards.filter((c) => c.sample).length

  async function bulkUpload(files) {
    const arr = [...files].filter((f) => f.type.startsWith('image/'))
    if (!arr.length) return
    setBulk({ done: 0, total: arr.length, errors: [] })
    let num = data.nextCollectionNumber
    const names = new Set(data.cards.map((c) => c.name.toLowerCase()))
    const errors = []
    for (let i = 0; i < arr.length; i++) {
      try {
        const art = await storeArtwork(arr[i])
        let name = nameFromFile(arr[i]), n = 2
        while (names.has(name.toLowerCase())) name = `${nameFromFile(arr[i])} ${n++}`
        names.add(name.toLowerCase())
        await run((s, tk) => s.upsertCard(tk, { name, description: '', rarityId: data.rarities[0].id, collectionNumber: num++, ...art, published: false, packIds: [], collectionIds: [] }), { quiet: true })
      } catch (e) { errors.push(`${arr[i].name}: ${e.message}`) }
      setBulk({ done: i + 1, total: arr.length, errors: [...errors] })
    }
    toast(`${arr.length - errors.length} drafts created — set each card's rarity and details, then publish`)
  }

  return (
    <div className="adm-cards">
      <div className="adm-bar">
        <Btn onClick={() => setEditing({ ...blankCard(data) })}>+ New card</Btn>
        <label className="btn btn-ghost">
          <span className="btn-in">⇪ Bulk upload artwork</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { bulkUpload(e.target.files); e.target.value = '' }} />
        </label>
        <span className="muted mono">{fmt(data.cards.length)} cards · {fmt(data.cards.filter((c) => c.published).length)} published</span>
      </div>
      {bulk && (
        <div className="window bulk-status">
          <span className="mono">UPLOADED {bulk.done}/{bulk.total}</span>
          {bulk.errors.map((e) => <div key={e} className="warn">{e}</div>)}
          {bulk.done === bulk.total && <button className="link" onClick={() => setBulk(null)}>dismiss</button>}
        </div>
      )}
      {samples > 0 && (
        <div className="note">
          {samples} sample cards with generated placeholder art are in the catalog so the game is playable out of the box.
          {' '}<button className="link" onClick={async () => (await ask(`Remove all ${samples} sample cards? Copies players hold are removed too.`, { ok: 'Remove samples', danger: true })) && run((s, tk) => s.removeSampleCards(tk)).then((r) => toast(`Removed ${r.removed} sample cards`))}>Remove sample cards</button>
        </div>
      )}

      <div className="adm-filter">
        <input type="search" placeholder="Search name, ID or #number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cards" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="all">All statuses</option><option value="pub">Published</option><option value="draft">Unpublished</option>
        </select>
        <select value={rar} onChange={(e) => setRar(e.target.value)} aria-label="Rarity">
          <option value="">All rarities</option>
          {data.rarities.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        {sel.size > 0 && <>
          <span className="mono">{sel.size} selected</span>
          <Btn size="sm" onClick={() => run((s, tk) => s.setPublished(tk, [...sel], true)).then(() => { toast(`Published ${sel.size}`); setSel(new Set()) })}>Publish</Btn>
          <Btn size="sm" variant="ghost" onClick={() => run((s, tk) => s.setPublished(tk, [...sel], false)).then(() => { toast(`Unpublished ${sel.size}`); setSel(new Set()) })}>Unpublish</Btn>
        </>}
      </div>

      <div className="adm-table" role="table">
        <div className="adm-row head" role="row">
          <span><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(list.map((c) => c.id)))} aria-label="Select all" /></span>
          <span>Art</span><span>No.</span><span>Name</span><span>Rarity</span><span>Value</span><span>Owned</span><span>Status</span><span />
        </div>
        {list.slice(0, limit).map((c) => (
          <div key={c.id} className="adm-row" role="row">
            <span><input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} /></span>
            <span className="thumb"><Thumb card={c} /></span>
            <span className="mono">{c.collectionNumber}</span>
            <span><b>{c.name}</b><br /><span className="mono muted">{c.code}{c.limited?.enabled ? ` · LTD ${c.limited.minted}/${c.limited.editionSize}` : ''}</span></span>
            <span><RarityTag rarity={rarityById[c.rarityId]} /></span>
            <span className="mono">{c.sellValue ?? <span className="muted">{rarityById[c.rarityId]?.sellValue}</span>}</span>
            <span className="mono">{data.ownership[c.id] || 0}</span>
            <span>
              <button className={`pill ${c.published ? 'on' : ''}`} onClick={() => run((s, tk) => s.setPublished(tk, [c.id], !c.published))}>
                {c.published ? 'LIVE' : 'DRAFT'}
              </button>
            </span>
            <span><Btn size="sm" variant="ghost" onClick={() => setEditing({ ...c })}>Edit</Btn></span>
          </div>
        ))}
        {list.length === 0 && <div className="adm-row"><span className="muted">No cards match.</span></div>}
      </div>
      {limit < list.length && <Btn variant="ghost" onClick={() => setLimit(limit + 200)}>Show more ({list.length - limit} left)</Btn>}

      {editing && <CardEditor draft={editing} data={data} run={run} toast={toast} onClose={() => setEditing(null)} />}
    </div>
  )
}

function Thumb({ card }) {
  // tiny, but still the original image — the browser scales it for display only
  const [u, setU] = useState(card.imageUrl || null)
  useEffect(() => { if (!card.imageUrl && card.imageKey) images.url(card.imageKey).then(setU) }, [card.imageKey, card.imageUrl])
  return u ? <img src={u} alt="" loading="lazy" /> : <span className="muted">—</span>
}

function blankCard(data) {
  return {
    name: '', description: '', rarityId: data.rarities[0]?.id, collectionNumber: data.nextCollectionNumber, sellValue: '',
    packIds: [], collectionIds: [], limited: { enabled: false, editionSize: 100 }, fit: 'contain', published: false,
    imageKey: null, imageUrl: null,
  }
}

function CardEditor({ draft: initial, data, run, toast, onClose }) {
  const [d, setD] = useState(initial)
  const [preview, setPreview] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }))
  const rarity = data.rarities.find((r) => r.id === d.rarityId)
  const owned = d.id ? data.ownership[d.id] || 0 : 0
  const previewCard = { ...d, name: d.name || 'Untitled card', code: d.code || `ORV-${String(data.nextCode).padStart(4, '0')}`, limited: { ...d.limited, minted: d.limited?.minted || 0 } }

  async function upload(f) {
    if (!f) return
    try { const art = await storeArtwork(f); setD((x) => ({ ...x, ...art, imageUrl: null })) } catch (e) { toast(e.message, 'error') }
  }
  async function save(publish) {
    setBusy(true)
    try {
      const saved = await run((s, tk) => s.upsertCard(tk, { ...d, published: publish ?? d.published }))
      toast(`${saved.name} saved${publish ? ' and published' : ''}`)
      onClose()
    } catch { /* toast shown */ } finally { setBusy(false) }
  }
  async function del() {
    if (!(await ask(`Delete "${d.name}" permanently?`, { ok: 'Delete card', danger: true }))) return
    try {
      const r = await run((s, tk) => s.deleteCard(tk, d.id))
      if (r.imageKey) await images.remove(r.imageKey)
      toast('Card deleted'); onClose()
    } catch { /* toast shown */ }
  }
  const togg = (k, id) => set(k, d[k].includes(id) ? d[k].filter((x) => x !== id) : [...d[k], id])

  return (
    <Modal onClose={onClose} wide label="Card editor">
      <WindowTitle onClose={onClose}>{d.id ? `EDIT ${d.code}` : 'NEW CARD'}</WindowTitle>
      <div className="editor">
        <div className="editor-preview">
          <CardFrame card={previewCard} rarity={rarity} size="lg" showCount={false} />
          <div className="editor-art-btns">
            <Btn variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>{d.imageKey || d.imageUrl ? 'Replace artwork' : 'Upload artwork'}</Btn>
            {(d.imageKey || d.imageUrl) && <Btn variant="ghost" size="sm" onClick={() => setZoom(true)}>View original</Btn>}
            <Btn variant="ghost" size="sm" onClick={() => setPreview(true)}>Full preview</Btn>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = '' }} />
          {d.imageW && <p className="fine mono">Original: {d.imageW}×{d.imageH}px — stored and displayed at full resolution.</p>}
          <div
            className="drop" onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files[0]) }}
          >or drop an image here</div>
        </div>

        <div className="editor-form">
          <label className="field"><span>Card name *</span>
            <input value={d.name} onChange={(e) => set('name', e.target.value)} maxLength={80} placeholder="e.g. Midnight Lantern" />
          </label>
          <label className="field"><span>Description</span>
            <textarea rows={3} value={d.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} />
          </label>
          <div className="field-row">
            <label className="field"><span>Rarity *</span>
              <select value={d.rarityId} onChange={(e) => set('rarityId', e.target.value)}>
                {data.rarities.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Collection no. *</span>
              <input type="number" min="1" step="1" value={d.collectionNumber} onChange={(e) => set('collectionNumber', e.target.value === '' ? '' : Number(e.target.value))} />
            </label>
            <label className="field"><span>Sell value</span>
              <input type="number" min="0" step="1" value={d.sellValue ?? ''} placeholder={`${rarity?.sellValue ?? 0} (rarity default)`} onChange={(e) => set('sellValue', e.target.value === '' ? '' : Number(e.target.value))} />
            </label>
          </div>
          <div className="field"><span>Artwork fit</span>
            <div className="seg">
              <button className={d.fit !== 'cover' ? 'on' : ''} onClick={() => set('fit', 'contain')} type="button">Whole image (no crop)</button>
              <button className={d.fit === 'cover' ? 'on' : ''} onClick={() => set('fit', 'cover')} type="button">Fill window (crops edges)</button>
            </div>
          </div>
          <fieldset className="field"><legend>Packs that can contain it</legend>
            <div className="checks">
              {data.packs.map((p) => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={p.poolMode === 'all' || d.packIds.includes(p.id)} disabled={p.poolMode === 'all'} onChange={() => togg('packIds', p.id)} />
                  <span>{p.name}{p.poolMode === 'all' && <span className="muted"> (draws from every published card)</span>}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field"><legend>Themed collections</legend>
            <div className="checks">
              {data.collections.map((c) => (
                <label key={c.id} className="check"><input type="checkbox" checked={d.collectionIds.includes(c.id)} onChange={() => togg('collectionIds', c.id)} /><span>{c.name}</span></label>
              ))}
              {!data.collections.length && <span className="muted">No collections yet — create them in the Collections tab.</span>}
            </div>
          </fieldset>
          <fieldset className="field"><legend>Limited edition</legend>
            <label className="check"><input type="checkbox" checked={!!d.limited?.enabled} onChange={(e) => set('limited', { ...d.limited, enabled: e.target.checked })} /><span>Only a fixed number of copies will ever exist</span></label>
            {d.limited?.enabled && (
              <label className="field inline"><span>Edition size</span>
                <input type="number" min={Math.max(1, d.limited.minted || 0)} value={d.limited.editionSize} onChange={(e) => set('limited', { ...d.limited, editionSize: Number(e.target.value) })} />
                {d.limited.minted > 0 && <span className="muted mono">{d.limited.minted} minted so far</span>}
              </label>
            )}
          </fieldset>
          <label className="check"><input type="checkbox" checked={!!d.published} onChange={(e) => set('published', e.target.checked)} /><span>Published (visible in the Collection and in packs)</span></label>

          <div className="editor-btns">
            {d.id && <Btn variant="danger" size="sm" onClick={del} disabled={owned > 0} title={owned ? 'Players own this card — unpublish instead' : ''}>Delete</Btn>}
            <span className="spacer" />
            <Btn variant="ghost" sound="back" onClick={onClose}>Cancel</Btn>
            <Btn variant="ghost" onClick={() => save()} disabled={busy}>Save{d.published ? '' : ' draft'}</Btn>
            {!d.published && <Btn onClick={() => save(true)} disabled={busy}>Save & publish</Btn>}
          </div>
          {owned > 0 && <p className="fine">Players hold {owned} {owned === 1 ? 'copy' : 'copies'}. Changes apply to their copies too.</p>}
        </div>
      </div>
      {preview && (
        <div className="preview-back" onClick={() => setPreview(false)}>
          <div className="preview-stage" onClick={(e) => e.stopPropagation()}>
            <CardFrame card={previewCard} rarity={rarity} size="xl" showCount={false} />
            <p className="mono">PREVIEW — how players will see it. <button className="link" onClick={() => setPreview(false)}>close</button></p>
          </div>
        </div>
      )}
      {zoom && <ArtZoom card={previewCard} onClose={() => setZoom(false)} />}
    </Modal>
  )
}
