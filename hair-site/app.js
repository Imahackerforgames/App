/* ===== The Hair Rookie — renders the page from data.js ===== */

import {
  DRAFT_MODE, business, services, policies, gallery, reviews, faq
} from './data.js';

const $ = (id) => document.getElementById(id);

/* Escape anything that comes out of data.js before it touches innerHTML. */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const igDM = `${business.instagram.replace(/\/$/, '')}/`;

/* Where the "Book" buttons point. While Acuity scheduling is switched off we
   send people to Instagram rather than to a page that can't take bookings. */
const bookHref = (!business.bookingOffline && business.bookingUrl)
  ? business.bookingUrl
  : igDM;
const bookIsExternal = true;

/* ---------- draft banner ---------- */
if (DRAFT_MODE) $('draftBanner').hidden = false;

/* ---------- header / hero text ---------- */
$('brandSub').textContent = business.location;
$('footSub').textContent = business.location;
$('heroEyebrow').textContent = business.location;
$('heroLede').textContent =
  `${business.tagline} — done with a light hand and a clean finish, in ${business.location}.`;
$('statusText').textContent = business.bookingStatus;
$('depositLine').textContent = `$${business.depositAmount} deposit to book`;
$('year').textContent = new Date().getFullYear();

for (const id of ['navBook', 'heroBook', 'cardBook']) {
  const el = $(id);
  el.href = bookHref;
  if (bookIsExternal) { el.target = '_blank'; el.rel = 'noopener'; }
}

/* ---------- services ---------- */
const money = (n) => `$${Number(n).toLocaleString('en-US')}`;

$('serviceGrid').innerHTML = services.map((s) => {
  const hasPrice = s.price !== null && s.price !== undefined;
  const priceHtml = hasPrice
    ? `<div class="price"><small>from</small>${money(s.price)}</div>`
    : `<div class="price inquire">Inquire</div>`;
  return `
    <article class="service">
      ${s.popular ? `<span class="tag-popular">Most booked</span>` : ''}
      <div class="service-top">
        <h3>${esc(s.name)}</h3>
        ${priceHtml}
      </div>
      <p>${esc(s.blurb)}</p>
      <div class="service-foot">
        <span>${esc(s.duration || '')}</span>
        ${s.sample ? `<span class="sample-flag">Sample price</span>` : ''}
      </div>
    </article>`;
}).join('');

const sampleCount = services.filter((s) => s.sample).length;
if (sampleCount) {
  const note = $('priceNote');
  note.hidden = false;
  note.innerHTML =
    `<strong>${sampleCount} of ${services.length} prices are placeholders.</strong> ` +
    `No prices are published on the Instagram page or the Acuity booking page, so these are ` +
    `typical downtown-Atlanta rates standing in until the real ones are set. Edit the ` +
    `<code>services</code> list in <code>data.js</code> and set <code>sample: false</code> on each one you fix.`;
}

/* ---------- gallery ---------- */
const IG_MARK = `<svg class="ig-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`;

$('galleryGrid').innerHTML = gallery.map((g) => `
  <a class="shot" href="${esc(g.permalink)}" target="_blank" rel="noopener"
     aria-label="${esc(g.caption)} — view on Instagram">
    <img src="${esc(g.image)}" alt="${esc(g.caption)}" loading="lazy" />
    <div class="shot-cap">${esc(g.caption)}</div>
  </a>`).join('');

/* Instagram blocks hotlinking, so any photo that isn't saved locally yet
   falls back to a styled card that still links to the real post. */
function fallbackShot(shot, img) {
  if (!shot.isConnected || shot.querySelector('.shot-empty')) return;
  const cap = shot.querySelector('.shot-cap');
  const label = cap ? cap.textContent : 'View post';
  img.remove();
  if (cap) cap.remove();
  shot.innerHTML =
    `<div class="shot-empty">${IG_MARK}<b>${esc(label)}</b><span>View on Instagram</span></div>`;
  showGalleryNote();
}

for (const shot of document.querySelectorAll('.shot')) {
  const img = shot.querySelector('img');
  img.addEventListener('error', () => fallbackShot(shot, img), { once: true });
  // The image can finish (and fail) before the listener above is attached, in
  // which case no error event ever fires — so check for that case directly.
  if (img.complete && img.naturalWidth === 0) fallbackShot(shot, img);
}

function showGalleryNote() {
  const note = $('galleryNote');
  if (note.hidden) {
    note.hidden = false;
    note.innerHTML =
      `<strong>Photos not added yet.</strong> Instagram blocks direct image downloads, so save each ` +
      `photo from the posts, drop the files into <code>hair-site/assets/gallery/</code>, and match the ` +
      `file names in the <code>gallery</code> list in <code>data.js</code>. Until then these cards link ` +
      `straight to the original posts.`;
  }
}

/* ---------- reviews ---------- */
$('reviewGrid').innerHTML = reviews.map((r) => `
  <figure class="review${r.sample ? ' is-sample' : ''}">
    <div class="stars" aria-label="${esc(r.stars)} out of 5">${'★'.repeat(r.stars || 5)}</div>
    <blockquote>“${esc(r.quote)}”</blockquote>
    <cite>${esc(r.author)}${r.sample ? ' · sample' : ''}</cite>
  </figure>`).join('');

if (reviews.some((r) => r.sample)) {
  const note = $('reviewNote');
  note.hidden = false;
  note.innerHTML =
    `<strong>These reviews are placeholders.</strong> The comments on the Instagram posts are emoji ` +
    `only, so there was nothing real to pull in. Ask a few past clients for a sentence each, put them ` +
    `in the <code>reviews</code> list in <code>data.js</code>, and set <code>sample: false</code>.`;
}

/* ---------- policies ---------- */
$('policyList').innerHTML = policies
  .map((p) => `<li><i class="check">✓</i><span>${esc(p)}</span></li>`)
  .join('');

/* ---------- faq ---------- */
$('faqList').innerHTML = faq.map((f) => `
  <details class="faq-item">
    <summary>${esc(f.q)}</summary>
    <p>${esc(f.a)}</p>
  </details>`).join('');

/* ---------- booking CTA ---------- */
$('ctaCopy').textContent =
  `Send a message with the style you want and the day that works for you. ` +
  `A $${business.depositAmount} deposit locks your slot in.`;

const actions = [
  `<a class="btn btn-primary" href="${esc(igDM)}" target="_blank" rel="noopener">Message on Instagram</a>`
];
if (business.bookingUrl && !business.bookingOffline) {
  actions.unshift(`<a class="btn btn-primary" href="${esc(business.bookingUrl)}" target="_blank" rel="noopener">Book online</a>`);
  actions[1] = actions[1].replace('btn-primary', 'btn-ghost');
}
if (business.phone) actions.push(`<a class="btn btn-ghost" href="tel:${esc(business.phone.replace(/[^\d+]/g, ''))}">Call ${esc(business.phone)}</a>`);
if (business.email) actions.push(`<a class="btn btn-ghost" href="mailto:${esc(business.email)}">Email</a>`);
$('ctaActions').innerHTML = actions.join('');

if (business.bookingOffline && business.bookingUrl) {
  $('ctaNote').textContent =
    'Online booking is paused right now — Instagram DM is the fastest way to reach her.';
}

/* ---------- footer links ---------- */
const foot = [`<a href="${esc(igDM)}" target="_blank" rel="noopener">@${esc(business.handle)}</a>`];
if (business.bookingUrl) foot.push(`<a href="${esc(business.bookingUrl)}" target="_blank" rel="noopener">Booking page</a>`);
if (business.phone) foot.push(`<a href="tel:${esc(business.phone.replace(/[^\d+]/g, ''))}">${esc(business.phone)}</a>`);
if (business.email) foot.push(`<a href="mailto:${esc(business.email)}">${esc(business.email)}</a>`);
$('footLinks').innerHTML = foot.join('');

/* ---------- mobile nav ---------- */
const nav = $('nav'), toggle = $('navToggle');
toggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  toggle.setAttribute('aria-expanded', String(open));
  toggle.textContent = open ? '✕' : '☰';
});
nav.addEventListener('click', (e) => {
  if (e.target.tagName === 'A' && nav.classList.contains('open')) {
    nav.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = '☰';
  }
});
