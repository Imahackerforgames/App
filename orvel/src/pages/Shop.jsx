import { useState } from 'react'
import PackArt from '../components/PackArt.jsx'
import PackOpening from '../components/PackOpening.jsx'
import { Btn, Cash, Meter, Modal, RarityTag, WindowTitle } from '../components/ui.jsx'
import { useGame, fmt } from '../store.jsx'
import { play } from '../lib/sound.js'

export const usd = (n) => `$${Number(n).toFixed(2)}`

export default function Shop() {
  const { snap, call } = useGame()
  const [opening, setOpening] = useState(null) // { opening, pack, method }
  const [odds, setOdds] = useState(null)
  const [checkout, setCheckout] = useState(null)
  const [confirmBuy, setConfirmBuy] = useState(null)
  const [busy, setBusy] = useState(false)

  const packs = snap.packs
  const featured = packs.filter((p) => p.featured)

  async function buyCash(pack) {
    if (busy) return
    setBusy(true)
    try {
      const r = await call((s) => s.buyPackWithCash(pack.id))
      setConfirmBuy(null)
      setOpening({ opening: r.opening, pack, method: 'cash' })
    } catch { /* toast already shown */ } finally { setBusy(false) }
  }

  const live = (id) => snap.packs.find((p) => p.id === id)
  const canAgain = opening?.method === 'cash' && live(opening.pack.id)?.status.ok && snap.player.cash >= opening.pack.priceCash

  return (
    <div className="page shop">
      <header className="page-head">
        <h1 className="page-title"><span className="pt-icon">◈</span> PACK SHOP</h1>
        <div className="wallet window"><span className="label">WALLET</span><Cash amount={snap.player.cash} big /></div>
      </header>

      {featured.length > 0 && (
        <section className="featured">
          <div className="section-label">★ FEATURED ★</div>
          {featured.map((p) => (
            <div key={p.id} className="feat window" style={{ '--p1': p.design.c1, '--p2': p.design.c2, '--p3': p.design.c3 }}>
              <div className="feat-art"><PackArt pack={p} size="lg" /></div>
              <div className="feat-info">
                <div className="feat-kicker">{p.premium ? 'PREMIUM PACK' : p.limited.enabled ? 'LIMITED EDITION' : 'FEATURED PACK'}</div>
                <h2>{p.name}</h2>
                <p className="feat-tag">{p.tagline}</p>
                <p>{p.description}</p>
                <PackMeta pack={p} />
                <PriceButtons pack={p} onCash={() => setConfirmBuy(p)} onReal={() => setCheckout(p)} onOdds={() => setOdds(p)} big />
              </div>
            </div>
          ))}
        </section>
      )}

      <section>
        <div className="section-label">ALL PACKS</div>
        <div className="pack-grid">
          {packs.map((p) => (
            <div key={p.id} className={`pack-tile window ${p.status.ok ? '' : 'pack-off'}`}>
              <div className="pt-art"><PackArt pack={p} /></div>
              <h3>{p.name}</h3>
              <p className="pt-tag">{p.tagline}</p>
              <PackMeta pack={p} />
              <PriceButtons pack={p} onCash={() => setConfirmBuy(p)} onReal={() => setCheckout(p)} onOdds={() => setOdds(p)} />
            </div>
          ))}
          {!packs.length && <div className="empty window"><h3>SHOP CLOSED</h3><p>No packs are on sale right now.</p></div>}
        </div>
      </section>

      <p className="fine center shop-legal">
        Packs contain randomly selected cards. Drop rates for every pack are listed under “Drop rates”.
        {' '}{snap.settings.currencyName} is an in-game currency with no cash value and cannot be redeemed for real money.
      </p>

      {confirmBuy && (
        <Modal onClose={() => setConfirmBuy(null)} label="Confirm purchase">
          <WindowTitle onClose={() => setConfirmBuy(null)}>CONFIRM PURCHASE</WindowTitle>
          <div className="modal-body buy-confirm">
            <PackArt pack={confirmBuy} size="sm" />
            <div>
              <p>Buy <b>{confirmBuy.name}</b> ({confirmBuy.cardCount} cards)?</p>
              <dl className="vi-stats small">
                <div><dt>PRICE</dt><dd><Cash amount={confirmBuy.priceCash} /></dd></div>
                <div><dt>BALANCE</dt><dd><Cash amount={snap.player.cash} /></dd></div>
                <div><dt>AFTER</dt><dd><Cash amount={snap.player.cash - confirmBuy.priceCash} /></dd></div>
              </dl>
              {snap.player.cash < confirmBuy.priceCash && <p className="warn">You need {fmt(confirmBuy.priceCash - snap.player.cash)} more {snap.settings.currencyName}. Sell duplicates or claim your daily reward to earn more.</p>}
              <button className="link" onClick={() => setOdds(confirmBuy)}>View drop rates</button>
              <div className="confirm-btns">
                <Btn variant="ghost" sound="back" onClick={() => setConfirmBuy(null)}>Cancel</Btn>
                <Btn variant="primary" disabled={busy || snap.player.cash < confirmBuy.priceCash} onClick={() => buyCash(confirmBuy)}>Buy & open</Btn>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {odds && <OddsModal pack={live(odds.id) || odds} onClose={() => setOdds(null)} />}
      {checkout && <Checkout pack={checkout} onClose={() => setCheckout(null)} onOpened={(op) => { setCheckout(null); setOpening({ opening: op, pack: checkout, method: 'real' }) }} />}
      {opening && (
        <PackOpening key={opening.opening.id} opening={opening.opening} pack={opening.pack}
          onClose={() => setOpening(null)}
          onAgain={canAgain ? () => buyCash(opening.pack) : null} />
      )}
    </div>
  )
}

function PackMeta({ pack }) {
  const { snap, rarityById } = useGame()
  const g = pack.guarantee?.minRarityId && rarityById[pack.guarantee.minRarityId]
  const left = pack.limited.enabled ? Math.max(0, pack.limited.stock - pack.limited.sold) : null
  return (
    <div className="pack-meta">
      <span className="pm-item">▤ {pack.cardCount} cards</span>
      {g && <span className="pm-item">Last card: <RarityTag rarity={g} /> or better</span>}
      {pack.poolMode === 'tagged' && <span className="pm-item">Exclusive card pool</span>}
      {left != null && (
        <div className="pm-stock">
          <span className="mono">{fmt(left)} / {fmt(pack.limited.stock)} left</span>
          <Meter value={left / Math.max(1, pack.limited.stock)} color="#ffd166" label="Stock remaining" />
        </div>
      )}
      {pack.limited.endsAt && <span className="pm-item">Ends {new Date(pack.limited.endsAt).toLocaleDateString()}</span>}
      {!pack.status.ok && <span className="pm-off">{pack.status.reason}</span>}
      <span className="sr-only">{snap.settings.currencyName}</span>
    </div>
  )
}

function PriceButtons({ pack, onCash, onReal, onOdds, big }) {
  const { snap } = useGame()
  const off = !pack.status.ok
  return (
    <div className={`prices ${big ? 'prices-big' : ''}`}>
      {pack.priceCash != null && (
        <Btn variant="primary" disabled={off} onClick={onCash} aria-label={`Buy for ${pack.priceCash} ${snap.settings.currencyName}`}>
          <Cash amount={pack.priceCash} />
        </Btn>
      )}
      {pack.priceUsd != null && snap.settings.realMoneyEnabled && (
        <Btn variant="real" disabled={off} onClick={onReal} aria-label={`Buy for ${usd(pack.priceUsd)}`}>
          {usd(pack.priceUsd)}
        </Btn>
      )}
      <button className="link odds-link" onClick={() => { play('click'); onOdds() }}>Drop rates</button>
    </div>
  )
}

export function OddsModal({ pack, onClose }) {
  const { snap, rarityById } = useGame()
  const o = pack.odds
  const g = o.guaranteed
  return (
    <Modal onClose={onClose} label={`${pack.name} drop rates`}>
      <WindowTitle onClose={onClose}>DROP RATES — {pack.name.toUpperCase()}</WindowTitle>
      <div className="modal-body">
        <table className="odds">
          <thead><tr><th>Rarity</th><th>{g ? `Cards 1–${pack.cardCount - 1}` : 'Each card'}</th>{g && <th>Card {pack.cardCount}</th>}<th>Cards in pool</th></tr></thead>
          <tbody>
            {o.standard.map((row, i) => (
              <tr key={row.rarityId}>
                <td><RarityTag rarity={rarityById[row.rarityId]} /></td>
                <td className="mono">{pctText(row.pct)}</td>
                {g && <td className="mono">{pctText(g.odds[i].pct)}</td>}
                <td className="mono">{row.cards}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="odds-notes">
          <li>Each card is drawn independently: first its rarity at the odds above, then one card at random from that rarity's pool.</li>
          {g && <li>The last card in every pack is guaranteed to be {rarityById[g.minRarityId]?.name} or rarer.</li>}
          <li>Rarities with no eligible cards are never drawn; their share is spread across the others, which is why these figures can differ from the base rates.</li>
          <li>Limited-edition cards stop appearing once every copy has been minted.</li>
          <li>Pool: {o.poolSize} eligible {o.poolSize === 1 ? 'card' : 'cards'}{pack.poolMode === 'tagged' ? ' assigned to this pack' : ' from the full catalog'}.</li>
        </ul>
        <p className="fine">{snap.settings.currencyName} has no real-world value.</p>
      </div>
    </Modal>
  )
}
const pctText = (p) => (p === 0 ? '—' : p < 0.01 ? '<0.01%' : p < 1 ? p.toFixed(2) + '%' : p.toFixed(1) + '%')

// Simulated real-money checkout. It follows the shape of a real integration —
// server order → provider-hosted payment → signed webhook → fulfilment — but
// no money moves and no payment details are ever asked for.
function Checkout({ pack, onClose, onOpened }) {
  const { snap, call, toast } = useGame()
  const [step, setStep] = useState('review') // review | provider | processing | failed
  const [age, setAge] = useState(false)
  const [order, setOrder] = useState(null)
  const [showOdds, setShowOdds] = useState(false)

  async function start() {
    try { const o = await call((s) => s.createOrder(pack.id, { ageConfirmed: age })); setOrder(o); setStep('provider') } catch {}
  }
  async function simulate(outcome) {
    setStep('processing')
    try {
      const evt = await call((s) => s._simulateProviderEvent(order.orderId, outcome))
      await new Promise((r) => setTimeout(r, 900))
      const r = await call((s) => s.handlePaymentWebhook(evt.body, evt.signature))
      if (r.opening) { play('coin'); onOpened(r.opening) } else { setStep('failed'); play('error') }
    } catch { setStep('failed') }
  }
  async function cancel() {
    if (order) await call((s) => s.cancelOrder(order.orderId), { quiet: true }).catch(() => {})
    if (order) toast('Checkout cancelled — you were not charged')
    onClose()
  }

  return (
    <Modal onClose={cancel} label="Checkout" className="checkout">
      <WindowTitle onClose={cancel}>CHECKOUT</WindowTitle>
      <div className="sim-banner">SIMULATED CHECKOUT · PROTOTYPE · NO REAL MONEY IS CHARGED</div>
      <div className="modal-body">
        {step === 'review' && (
          <div className="buy-confirm">
            <PackArt pack={pack} size="sm" />
            <div>
              <p><b>{pack.name}</b> — {pack.cardCount} random cards</p>
              <div className="price-line"><span>Price</span><b className="mono">{usd(pack.priceUsd)}</b></div>
              <p className="fine">This pack contains randomly selected cards. <button className="link" onClick={() => setShowOdds(true)}>See the drop rates</button> before you buy.
                Cards are digital collectibles for use in ORVEL only.</p>
              <label className="check">
                <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
                <span>I am {snap.settings.minAge} or older (or have permission from a parent or guardian) and I have read the drop rates.</span>
              </label>
              <div className="confirm-btns">
                <Btn variant="ghost" sound="back" onClick={cancel}>Cancel</Btn>
                <Btn variant="real" disabled={!age} onClick={start}>Continue to payment</Btn>
              </div>
            </div>
          </div>
        )}
        {step === 'provider' && (
          <div className="provider">
            <div className="provider-head">PAYMENT PROVIDER (TEST MODE)</div>
            <p>In the live game this step happens on the payment provider's secure page or the app store's purchase sheet. ORVEL never sees or stores card details.</p>
            <div className="price-line"><span>Order</span><span className="mono">{order.orderId.slice(0, 14)}…</span></div>
            <div className="price-line"><span>Amount</span><b className="mono">{usd(order.amountUsd)}</b></div>
            <div className="provider-btns">
              <Btn variant="real" onClick={() => simulate('paid')}>Simulate successful payment</Btn>
              <Btn variant="ghost" onClick={() => simulate('failed')}>Simulate declined payment</Btn>
              <Btn variant="ghost" sound="back" onClick={cancel}>Cancel</Btn>
            </div>
          </div>
        )}
        {step === 'processing' && <div className="processing"><div className="spinner" /><p className="mono blink">VERIFYING PAYMENT…</p></div>}
        {step === 'failed' && (
          <div className="processing">
            <p className="warn">The payment did not go through, and no pack was awarded. You have not been charged.</p>
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
          </div>
        )}
      </div>
      {showOdds && <OddsModal pack={snap.packs.find((p) => p.id === pack.id) || pack} onClose={() => setShowOdds(false)} />}
    </Modal>
  )
}
