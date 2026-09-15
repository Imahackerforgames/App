/* ===== Queen K Beauty Etc — renders the page from data.js ===== */

import {
  DRAFT_MODE, business, payments, hours, scheduling, categories, addOns,
  bookingPolicies, salonPolicies, checklist, clientPhotos, reviews, faq
} from './data.js';

const $ = (id) => document.getElementById(id);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const money = (n) => `$${Number(n).toLocaleString('en-US')}`;
const telHref = (p) => `tel:${String(p).replace(/[^\d+]/g, '')}`;


/* ---------- tiny icon set ---------- */
const ICON = {
  x:       `<path d="M6 6l12 12M18 6L6 18"/>`,
  money:   `<path d="M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5S8 6.1 8 7.5 9.8 10 12 10s4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5"/>`,
  users:   `<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5M17 20a5.5 5.5 0 0 0-2-4.3"/>`,
  clock:   `<circle cx="12" cy="12" r="9"/><path d="M12 7v5.2l3.2 2"/>`,
  box:     `<path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5v-7Z"/><path d="M3 8.5 12 13l9-4.5M12 13v7"/>`,
  sparkle: `<path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.4l-1.9-5.6L4.5 10.9 10.1 9 12 3.5Z"/><path d="M18.5 3.5v3M20 5h-3"/>`,
  alert:   `<path d="M12 4.5 21 19.5H3L12 4.5Z"/><path d="M12 10v4M12 16.8v.2"/>`,
  drop:    `<path d="M12 3.5s5.5 6 5.5 9.5a5.5 5.5 0 0 1-11 0C6.5 9.5 12 3.5 12 3.5Z"/>`,
  phone:   `<path d="M6 3.5h3l1.6 4-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 4 1.6v3a1.6 1.6 0 0 1-1.8 1.6A16.6 16.6 0 0 1 4.4 5.3 1.6 1.6 0 0 1 6 3.5Z"/>`,
  mail:    `<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.8 7 8.2 6 8.2-6"/>`,
  ig:      `<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none"/>`,
  fb:      `<path d="M14.5 8.5H17V5h-2.5A4 4 0 0 0 10.5 9v2H8v3.5h2.5V21H14v-6.5h2.6l.4-3.5H14V9.3c0-.5.2-.8.5-.8Z"/>`,
  pin:     `<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>`,
  camera:  `<path d="M3 8a2 2 0 0 1 2-2h2.2l1.2-1.8h7.2L16.8 6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/><circle cx="12" cy="12.5" r="3.4"/>`
};
const svg = (name, cls = '') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
        stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

/* ---------- draft banner ---------- */
if (DRAFT_MODE) $('draftBanner').hidden = false;

/* ---------- hero ---------- */
$('heroSub').textContent = business.welcome;
$('year').textContent = new Date().getFullYear();

$('heroBadges').innerHTML = [
  `<span class="badge"><i class="dot"></i> Booking open</span>`,
  `<span class="badge">${svg('pin')} ${esc(business.location)}</span>`,
  `<span class="badge">${money(business.deposit)} deposit to book</span>`,
  `<span class="badge">${esc(hours.standard.days)} · ${esc(hours.standard.time)}</span>`
].join('');

/* ---------- styles & prices ---------- */
const ALL = 'All';
const priced = categories.filter((c) => c.services.length);
const unpriced = categories.filter((c) => !c.services.length);

$('filters').innerHTML = [ALL, ...priced.map((c) => c.name)]
  .map((name, i) => `<button class="chip" type="button" data-cat="${esc(name)}"
        aria-pressed="${i === 0 ? 'true' : 'false'}">${esc(name)}</button>`)
  .join('');

function svcRow(cat, s) {
  const priceHtml = (s.price === null || s.price === undefined)
    ? `<span class="svc-price inq">Inquire</span>`
    : `<span class="svc-price">${money(s.price)}</span>`;
  return `
    <li class="svc">
      <span class="svc-name">
        <span class="svc-title">
          ${esc(s.name)}
          ${s.duration ? `<span class="svc-dur">${esc(s.duration)}</span>` : ''}
          ${s.sample ? `<span class="sample-flag">Sample</span>` : ''}
        </span>
        ${s.note ? `<span class="svc-note">${esc(s.note)}</span>` : ''}
      </span>
      <span class="svc-actions">
        ${priceHtml}
        <button class="svc-book" type="button"
                data-book="${esc(cat.name)} — ${esc(s.name)}">Book</button>
      </span>
    </li>`;
}

$('catGrid').innerHTML = categories.map((c) => `
  <article class="cat" data-cat="${esc(c.name)}">
    <div class="cat-head">
      <h3>${esc(c.name)}</h3>
      ${c.featured ? `<span class="tag-featured">Most booked</span>` : ''}
    </div>
    <p>${esc(c.blurb)}</p>
    <ul class="svc-list">${c.services.map((s) => svcRow(c, s)).join('')}</ul>
  </article>`).join('');

/* The categories without published prices collapse to a single line rather
   than four near-empty cards. */
if (unpriced.length) {
  $('moreStyles').innerHTML =
    `<b>Also available:</b> ${unpriced.map((c) => esc(c.name)).join(' · ')} — ` +
    `<button class="link-btn" type="button" data-open-book>pick a time and see pricing</button>`;
} else {
  $('moreStyles').hidden = true;
}

$('filters').addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const pick = chip.dataset.cat;
  for (const c of $('filters').querySelectorAll('.chip')) {
    c.setAttribute('aria-pressed', String(c === chip));
  }
  for (const card of $('catGrid').querySelectorAll('.cat')) {
    card.hidden = !(pick === ALL || card.dataset.cat === pick);
  }
});

const sampleCount = categories.flatMap((c) => c.services).filter((s) => s.sample).length;
const totalSvc = categories.flatMap((c) => c.services).length;
if (sampleCount) {
  const n = $('priceNote');
  n.hidden = false;
  n.innerHTML =
    `<strong>${sampleCount} of ${totalSvc} prices still need confirming.</strong> ` +
    `The categories, the add-on prices and Entire Head of Color came straight off the real ` +
    `booking page. The rest are marked <em>Sample</em> — set each <code>price</code> in ` +
    `<code>data.js</code> and remove its <code>sample: true</code>.`;
}

/* ---------- add-ons ---------- */
$('addonList').innerHTML = addOns.map((a) => `
  <div class="addon">
    <span class="addon-name">${esc(a.name)} <i>${esc(a.duration)}</i></span>
    <span class="amt">${money(a.price)}</span>
  </div>`).join('');

/* ============================================================
   BOOKING — service + calendar + PM time slots
   ============================================================ */

/* Every bookable service, flattened for the dropdown. */
const allServices = categories.flatMap((c) =>
  c.services.map((s) => ({
    label: `${c.name} — ${s.name}`, price: s.price, duration: s.duration
  })));

/* "1 hr 30 min", "45 min", "2 hrs" -> minutes. Falls back to an hour. */
function durationMinutes(text) {
  if (!text) return 60;
  const hrs = /(\d+)\s*hr/.exec(text);
  const mins = /(\d+)\s*min/.exec(text);
  const total = (hrs ? +hrs[1] * 60 : 0) + (mins ? +mins[1] : 0);
  return total || 60;
}

/* The appointment's wall-clock start and end, plus how long it runs. */
function appointmentWindow() {
  const svc = allServices.find((x) => x.label === state.service);
  const start = new Date(state.date);
  start.setHours(Math.floor(state.time / 60), state.time % 60, 0, 0);
  const end = new Date(start.getTime() + durationMinutes(svc && svc.duration) * 60000);
  const local = (d) =>
    d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + 'T' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':00';
  return { start, end, startLocal: local(start), endLocal: local(end), svc };
}

/* Hand the booking to the owner's Google Calendar.
   The endpoint is a Google Apps Script running in her own account (see
   google-calendar/README.md), so the event is created as her — automatically,
   with no server in between.

   Google redirects the reply, which a browser will not let a page read, so
   this is deliberately fire-and-forget: the client's confirmation never waits
   on it, and never fails because of it. The script logs every attempt under
   Executions, and the Add to Google Calendar button is the backup. */
function sendToOwnerCalendar(details, { name, phone, email, paid }) {
  if (!business.calendarWebhookUrl) return false;

  const w = appointmentWindow();
  const payload = {
    secret: business.calendarSecret,
    title: `${state.service} — ${name}`,
    start: w.startLocal,
    end: w.endLocal,
    timeZone: business.calendarTz,
    location: business.location,
    details
  };

  try {
    fetch(business.calendarWebhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      /* text/plain keeps this a "simple" request, so the browser sends it
         without a preflight that Apps Script would not answer. */
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    }).catch(() => {});      // never let a calendar hiccup break the booking
    return true;
  } catch {
    return false;
  }
}

/* Google Calendar's event template link. No backend needed: the link
   carries the whole event, and opening it drops it straight into the
   calendar of whoever clicks. */
function bookingDetails({ name, phone, email, paid }) {
  const q = quote();
  const svc = allServices.find((x) => x.label === state.service);
  return [
    `Service: ${state.service}`,
    svc && svc.duration ? `Length: ${svc.duration}` : '',
    `Client: ${name}`,
    `Phone: ${phone}`,
    email ? `Email: ${email}` : '',
    q.feeLabels.length ? `Fees: ${q.feeLabels.join(' + ')}` : '',
    q.priced ? `Total: ${money(q.total)}` : '',
    `Paid now: ${money(paid)}`,
    q.priced && paid < q.total ? `Balance on the day: ${money(q.total - paid)}` : 'Paid in full'
  ].filter(Boolean).join('\n');
}

function calendarLink({ name, phone, email, paid }) {
  const q = quote();
  const { start, end, svc } = appointmentWindow();
  const stamp = (d) =>
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') + 'T' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') + '00';

  const details = bookingDetails({ name, phone, email, paid });

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${state.service} — ${business.fullName}`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details,
    location: business.location,
    ctz: business.calendarTz
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

$('svcSelect').innerHTML =
  `<option value="">Choose a style…</option>` +
  categories.filter((c) => c.services.length).map((c) => `
    <optgroup label="${esc(c.name)}">
      ${c.services.map((s) => {
        const v = `${c.name} — ${s.name}`;
        const p = (s.price === null || s.price === undefined) ? '' : ` · ${money(s.price)}`;
        return `<option value="${esc(v)}">${esc(s.name)}${esc(p)}</option>`;
      }).join('')}
    </optgroup>`).join('');

const state = { service: '', date: null, time: null, payChoice: 'deposit' };

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DOW = ['S','M','T','W','T','F','S'];

const today = new Date(); today.setHours(0, 0, 0, 0);
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();

const lastMonth = new Date(today.getFullYear(), today.getMonth() + scheduling.monthsAhead, 1);

const sameDay = (a, b) =>
  a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/* Sunday carries a fee (her flyer offers Sunday with a $45 fee). */
const sundayFee = (hours.fees.find((f) => /sunday/i.test(f.label)) || {}).amount || 0;
const eveFee    = (hours.fees.find((f) => /5:30/.test(f.label)) || {}).amount || 0;
const lateFee   = (hours.fees.find((f) => /7:00/.test(f.label)) || {}).amount || 0;

function dayFee(d) {
  return (scheduling.sundayOpen && d.getDay() === 0) ? sundayFee : 0;
}
function dayBookable(d) {
  if (d < today) return false;
  if (d.getDay() === 0 && !scheduling.sundayOpen) return false;
  return true;
}

function renderCalendar() {
  $('calMonth').textContent = `${MONTHS[viewMonth]} ${viewYear}`;

  const first = new Date(viewYear, viewMonth, 1);
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const lead = first.getDay();

  const cells = [];
  for (const d of DOW) cells.push(`<div class="cal-dow">${d}</div>`);
  for (let i = 0; i < lead; i++) cells.push(`<button class="cal-day is-empty" disabled tabindex="-1"></button>`);

  for (let n = 1; n <= daysInMonth; n++) {
    const d = new Date(viewYear, viewMonth, n);
    const ok = dayBookable(d);
    const fee = dayFee(d);
    cells.push(`
      <button class="cal-day" type="button" data-day="${n}"
              ${ok ? '' : 'disabled'}
              aria-pressed="${sameDay(d, state.date)}"
              aria-label="${MONTHS[viewMonth]} ${n}${fee ? `, ${money(fee)} fee` : ''}">
        ${n}${fee && ok ? `<i class="fee-dot"></i>` : ''}
      </button>`);
  }
  $('calGrid').innerHTML = cells.join('');

  const atStart = viewYear === today.getFullYear() && viewMonth === today.getMonth();
  const atEnd   = viewYear === lastMonth.getFullYear() && viewMonth === lastMonth.getMonth();
  $('calPrev').disabled = atStart;
  $('calNext').disabled = atEnd;
}

$('calGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.cal-day');
  if (!btn || btn.disabled || !btn.dataset.day) return;
  state.date = new Date(viewYear, viewMonth, Number(btn.dataset.day));
  state.time = null;
  renderCalendar();
  renderSlots();
  updateSummary();
});

$('calPrev').addEventListener('click', () => {
  if (--viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderCalendar();
});
$('calNext').addEventListener('click', () => {
  if (++viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderCalendar();
});

/* ---------- time slots (PM) ---------- */
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fmt = (mins) => {
  const h24 = Math.floor(mins / 60), m = mins % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
};

function slotFee(mins) {
  // Her flyer reads "$30 AFTER 5:30 PM" / "$40 AFTER 7PM", so the cutoff
  // times themselves are still standard — strictly greater than, not >=.
  if (mins > toMin('19:00')) return { amount: lateFee, label: 'After 7 PM' };
  if (mins > toMin('17:30')) return { amount: eveFee,  label: 'After 5:30' };
  return { amount: 0, label: '' };
}

function renderSlots() {
  $('slotTz').textContent = business.timezone;

  if (!state.date) {
    $('slotDate').textContent = 'Select a day first';
    $('slotGrid').innerHTML = `<div class="slots-empty">Pick a date on the calendar to see open times.</div>`;
    return;
  }

  const d = state.date;
  $('slotDate').textContent =
    `${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;

  const start = toMin(scheduling.dayStart);
  const end   = toMin(scheduling.eveningEnd);
  const step  = scheduling.slotMinutes;

  // On today's date, drop slots that have already passed.
  const now = new Date();
  const isToday = sameDay(d, now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const out = [];
  for (let m = start; m <= end; m += step) {
    if (isToday && m <= nowMin) continue;
    const f = slotFee(m);
    out.push(`
      <button class="slot" type="button" data-min="${m}"
              aria-pressed="${state.time === m}">
        ${fmt(m)}
        ${f.amount ? `<span class="fee">+${money(f.amount)}</span>` : ''}
      </button>`);
  }

  $('slotGrid').innerHTML = out.length
    ? out.join('')
    : `<div class="slots-empty">No times left today — pick another day.</div>`;
}

$('slotGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.slot');
  if (!btn) return;
  state.time = Number(btn.dataset.min);
  for (const s of $('slotGrid').querySelectorAll('.slot')) {
    s.setAttribute('aria-pressed', String(Number(s.dataset.min) === state.time));
  }
  updateSummary();
});

/* ---------- service pickers ---------- */
$('svcSelect').addEventListener('change', (e) => {
  state.service = e.target.value;
  updateSummary();
});

/* "Book" buttons on the price bubbles jump into the booker with the style set. */
$('catGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.svc-book');
  if (!btn) return;
  openBooker(btn.dataset.book);
});

/* ---------- summary ---------- */
/* The one place the cost of the current selection is worked out, so the
   summary bar and the payment screen can never disagree. */
function quote() {
  let fees = 0;
  const feeLabels = [];

  if (state.date) {
    const f = dayFee(state.date);
    if (f) { fees += f; feeLabels.push(`${money(f)} Sunday fee`); }
  }
  if (state.time !== null) {
    const f = slotFee(state.time);
    if (f.amount) { fees += f.amount; feeLabels.push(`${money(f.amount)} ${f.label.toLowerCase()} fee`); }
  }

  const svcPrice = (allServices.find((x) => x.label === state.service) || {}).price;
  const priced = svcPrice !== null && svcPrice !== undefined;
  const total = priced ? svcPrice + fees : null;
  const deposit = business.deposit;

  return {
    svcPrice, priced, fees, feeLabels, total, deposit,
    balance: priced ? Math.max(total - deposit, 0) : null,
    /* What the client is paying right now. Pay-in-full needs a known price. */
    dueNow: (state.payChoice === 'full' && priced) ? total : deposit
  };
}

function updateSummary() {
  const parts = [];
  const q = quote();
  const { fees, feeLabels } = q;

  $('sumMain').textContent = state.service
    ? state.service.toUpperCase()
    : 'YOUR APPOINTMENT';

  if (state.date) {
    parts.push(`<b>${MONTHS[state.date.getMonth()]} ${state.date.getDate()}</b>`);
  }
  if (state.time !== null) parts.push(`<b>${fmt(state.time)}</b>`);

  if (q.priced) parts.push(`<b>${money(q.svcPrice)}</b>`);

  $('sumSub').innerHTML = parts.length
    ? parts.join(' &nbsp;·&nbsp; ')
    : 'Choose a style, a day and a time.';

  const notes = [];
  if (feeLabels.length) notes.push(feeLabels.join(' + '));
  notes.push(state.payChoice === 'full' && q.priced
    ? `paying in full · ${money(q.total)}`
    : `${money(q.deposit)} deposit due at booking`);
  $('sumNote').textContent = notes.join(' · ');

  const ready = state.service && state.date && state.time !== null;
  const go = $('sumGo');
  go.disabled = !ready;
  go.textContent = ready
    ? `Confirm & pay ${money(q.dueNow)} →`
    : 'Confirm & pay';
}

renderCalendar();
renderSlots();
updateSummary();

/* ---------- client photos ---------- */
$('polaroids').innerHTML = clientPhotos.map((p) => `
  <figure class="polaroid">
    <div class="frame">
      <img src="${esc(p.image)}" alt="${esc(p.caption)}" loading="lazy" />
    </div>
  </figure>`).join('');

function fallbackPhoto(frame, img) {
  if (!frame.isConnected || frame.querySelector('.ph')) return;
  img.remove();
  frame.innerHTML = `<div class="ph">${svg('camera')}</div>`;
  // No on-page note: this is a customer-facing page, and the empty frame
  // already reads as "photo coming". Setup steps live in
  // assets/reviews/README.txt, and `node build.mjs` lists what's missing.
}

for (const fig of document.querySelectorAll('.polaroid')) {
  const frame = fig.querySelector('.frame');
  const img = frame.querySelector('img');
  const caption = img.alt;
  img.addEventListener('error', () => fallbackPhoto(frame, img), { once: true });
  // The image can fail before this listener attaches — no error event fires then.
  if (img.complete && img.naturalWidth === 0) fallbackPhoto(frame, img);
}

/* ---------- written reviews ---------- */
if (!reviews.length) $('reviewGrid').hidden = true;

$('reviewGrid').innerHTML = reviews.map((r) => `
  <figure class="review${r.sample ? ' is-sample' : ''}">
    <div class="stars" aria-label="${esc(r.stars)} out of 5">${'★'.repeat(r.stars || 5)}</div>
    <blockquote>“${esc(r.quote)}”</blockquote>
    <div class="review-foot">
      <cite>${esc(r.author)}${r.sample ? ' · sample' : ''}</cite>
      ${r.service ? `<span class="svc-tag">${esc(r.service)}</span>` : ''}
    </div>
  </figure>`).join('');

if (reviews.some((r) => r.sample)) {
  const n = $('reviewNote');
  n.hidden = false;
  n.innerHTML =
    `<strong>These written reviews are placeholders.</strong> Ask a few clients for a sentence each, ` +
    `put them in the <code>reviews</code> list in <code>data.js</code>, and set <code>sample: false</code>.`;
}

/* ---------- policies ---------- */
const polRow = (p) => `<dt>${esc(p.title)}</dt><dd>${esc(p.text)}</dd>`;

$('bookingPolList').innerHTML = bookingPolicies.map(polRow).join('');
$('salonPolList').innerHTML = salonPolicies.map(polRow).join('');

/* ---------- checklist ---------- */
$('checkLine').textContent = checklist.join(' · ');

/* ---------- contact & hours ---------- */
/* Contact sits in the sticky header so it is reachable from anywhere.
   Labels show on wide screens; the icons alone carry it on a phone. */
const headContact = [];
if (business.phone) headContact.push(
  `<a class="c-chip" href="${esc(telHref(business.phone))}" title="Call ${esc(business.phone)}">
     ${svg('phone')}<span>${esc(business.phone)}</span></a>`);
if (business.email) headContact.push(
  `<a class="c-chip" href="mailto:${esc(business.email)}" title="Email ${esc(business.email)}">
     ${svg('mail')}<span>Email</span></a>`);
if (business.instagram) headContact.push(
  `<a class="c-chip" href="${esc(business.instagram)}" target="_blank" rel="noopener"
      title="Instagram ${esc(business.igHandle)}">${svg('ig')}<span>Instagram</span></a>`);
$('headContact').innerHTML = headContact.join('');

$('hoursDays').textContent = hours.standard.days;
$('hoursTime').textContent = hours.standard.time;
$('feeList').innerHTML = hours.fees.map((f) => `
  <li><span>${esc(f.label)}</span>
      <span class="amt">${f.amount === null ? 'Available' : money(f.amount)}</span></li>`).join('');

$('addr').innerHTML = `${svg('pin')} ${esc(business.location)}`;

/* ---------- CTA + footer ---------- */
$('ctaTag').textContent =
  `Your feedback and review are important. Tag ${business.igHandle} in your selfie — ${business.owner}.`;

$('ctaActions').innerHTML = [
  `<a class="btn btn-white" href="#book">Schedule an appointment</a>`,
  business.instagram ? `<a class="btn btn-outline" href="${esc(business.instagram)}" target="_blank" rel="noopener">Follow on Instagram</a>` : ''
].join('');

$('footLinks').innerHTML = [
  `<a href="${esc(telHref(business.phone))}">${esc(business.phone)}</a>`,
  `<a href="mailto:${esc(business.email)}">${esc(business.email)}</a>`,
  `<a href="${esc(business.instagram)}" target="_blank" rel="noopener">${esc(business.igHandle)}</a>`
].join('');

/* ============================================================
   BOOKING POPUP
   The booking step no longer sits in the page — it opens over it,
   so a visitor goes straight from a price to picking a time.
   ============================================================ */
const dlg = $('bookDlg');

/* ---------- her Acuity scheduler, embedded ----------
   Step 2 of the popup. The client picks style, day and time in the panel
   above, then confirms and pays here — inside this page, on her existing
   Acuity account, with no link out to the old booking site.

   The frame is built on first use, not on page load, so nothing contacts
   Acuity until someone is actually booking. */
let embedBuilt = false;

function buildEmbed() {
  if (embedBuilt) return;
  embedBuilt = true;

  const frame = document.createElement('iframe');
  frame.src = business.embedSrc;
  frame.title = 'Choose your time and pay your deposit';
  frame.allow = 'payment';                 // lets Acuity take the deposit
  frame.referrerPolicy = 'no-referrer-when-downgrade';
  $('embedFrame').appendChild(frame);

  /* A browser gives a page no way to tell a loaded cross-site frame from a
     refused one, so instead of guessing we always offer the phone as a
     way through. */
  $('embedHelp').innerHTML =
    `Not loading? Call <a href="${esc(telHref(business.phone))}">${esc(business.phone)}</a> ` +
    `and ${esc(business.owner.split(' ')[0])} will book you in.`;
}

/* ---------- demo payment screen ----------
   A MOCK-UP. It is wired to nothing: no network call, no storage, no
   processor. Its only job is to show what the deposit step looks like
   while a real backend is still to come.

   The warning banner is part of the markup rather than an option, so this
   screen can never render without it. The inputs deliberately carry
   autocomplete="off" and generic names so a browser will not offer to
   autofill somebody's real saved card into a form that goes nowhere.

   TO MAKE THIS REAL: delete this function and mount Stripe Elements or
   Square Web Payments into #payDemo instead. Both render the card field
   inside their own iframe, so the card number goes straight to the
   processor and never touches this page. Then set payments.mode to
   "acuity", or point the new backend at her account. */
function renderPaymentDemo() {
  const q = quote();
  const when = state.date
    ? `${MONTHS[state.date.getMonth()]} ${state.date.getDate()}` +
      (state.time !== null ? ` at ${fmt(state.time)}` : '')
    : '';

  /* Pay-in-full needs a known service price; without one, only the flat
     deposit can be offered. */
  const choice = q.priced ? `
    <div class="pay-choice" role="group" aria-label="How much to pay now">
      <button type="button" class="pay-opt" data-pay="deposit"
              aria-pressed="${state.payChoice === 'deposit'}">
        <span class="pay-opt-top">Pay deposit</span>
        <span class="pay-opt-amt">${money(q.deposit)}</span>
        <span class="pay-opt-sub">${money(q.balance)} due at your appointment</span>
      </button>
      <button type="button" class="pay-opt" data-pay="full"
              aria-pressed="${state.payChoice === 'full'}">
        <span class="pay-opt-top">Pay in full</span>
        <span class="pay-opt-amt">${money(q.total)}</span>
        <span class="pay-opt-sub">Nothing left to pay on the day</span>
      </button>
    </div>` : '';

  const feeLine = q.feeLabels.length
    ? `<div class="pay-fees">Includes ${q.feeLabels.join(' + ')}</div>` : '';

  $('payDemo').hidden = false;
  $('payDemo').innerHTML = `
    <p class="pay-warn">
      <b>Demo screen — not a real checkout.</b>
      This form is not connected to any payment processor. Nothing is sent
      anywhere, nothing is saved, and no money moves. Do not type a real
      card number.
    </p>

    <div class="pay-summary">
      <div>
        <span class="pay-svc">${esc(state.service || 'Your appointment')}</span>
        ${when ? `<span class="pay-when">${esc(when)}</span>` : ''}
        ${feeLine}
      </div>
      <div class="pay-amount">
        <small>Paying now</small>${money(q.dueNow)}
      </div>
    </div>

    ${choice}

    <form class="pay-form" id="payForm" novalidate autocomplete="off">
      <label class="pay-field">
        <span>Your name</span>
        <input id="payName" type="text" autocomplete="off" placeholder="Jane Doe" />
      </label>
      <div class="pay-row">
        <label class="pay-field">
          <span>Phone number</span>
          <input id="payPhone" type="tel" inputmode="tel" autocomplete="off"
                 placeholder="(912) 555-0123" />
        </label>
        <label class="pay-field">
          <span>Email <i>optional</i></span>
          <input id="payEmail" type="email" inputmode="email" autocomplete="off"
                 placeholder="you@email.com" />
        </label>
      </div>
      <label class="pay-field">
        <span>Card number</span>
        <input id="payCard" type="text" inputmode="numeric" autocomplete="off"
               placeholder="4242 4242 4242 4242" maxlength="23" />
      </label>
      <div class="pay-row">
        <label class="pay-field">
          <span>Expiry</span>
          <input id="payExp" type="text" inputmode="numeric" autocomplete="off"
                 placeholder="MM / YY" maxlength="7" />
        </label>
        <label class="pay-field">
          <span>Security code</span>
          <input id="payCvc" type="text" inputmode="numeric" autocomplete="off"
                 placeholder="123" maxlength="4" />
        </label>
        <label class="pay-field">
          <span>ZIP</span>
          <input id="payZip" type="text" inputmode="numeric" autocomplete="off"
                 placeholder="31401" maxlength="10" />
        </label>
      </div>
      <button class="btn btn-white pay-submit" type="submit">
        Pay ${money(q.dueNow)} &mdash; demo
      </button>
      <p class="pay-foot">
        Testing? Any made-up card works here &mdash; try <b>4242 4242 4242 4242</b>,
        <b>12 / 30</b>, <b>123</b>. The finished version charges the card through
        ${esc(business.owner.split(' ')[0])}'s own booking account, so the payment lands with her.
      </p>
    </form>`;

  /* Light formatting only — these values are never read back out. */
  const group = (el, size, sep) => el.addEventListener('input', () => {
    const digits = el.value.replace(/\D/g, '').slice(0, size);
    el.value = digits.replace(/(.{4})/g, '$1 ').trim();
    if (sep) el.value = digits.length > 2
      ? digits.slice(0, 2) + ' / ' + digits.slice(2)
      : digits;
  });
  group($('payCard'), 16, false);
  group($('payExp'), 4, true);

  /* The phone box lays itself out as (912) 555-0123 while you type, so the
     client never has to think about brackets or dashes. Deleting works
     normally because the caret is only forced to the end when you are
     actually typing at the end. */
  $('payPhone').addEventListener('input', (e) => {
    const el = e.target;
    const atEnd = el.selectionStart === el.value.length;
    let d = el.value.replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);   // drop a leading 1
    d = d.slice(0, 10);

    let out = d;
    if (d.length > 6)      out = `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    else if (d.length > 3) out = `(${d.slice(0, 3)}) ${d.slice(3)}`;
    else if (d.length > 0) out = `(${d}`;

    el.value = out;
    if (atEnd) el.setSelectionRange(out.length, out.length);
  });

  for (const opt of $('payDemo').querySelectorAll('.pay-opt')) {
    opt.addEventListener('click', () => {
      state.payChoice = opt.dataset.pay;
      updateSummary();
      renderPaymentDemo();          // redraw with the new amount
    });
  }

  /* Required: name, phone and the card fields. Email is optional. Nothing
     is announced up front — a field is only marked once someone tries to
     go on without it, and the mark clears as soon as they type. */
  const required = ['payName', 'payPhone', 'payCard', 'payExp', 'payCvc'];
  for (const id of required) {
    $(id).addEventListener('input', () => $(id).classList.remove('is-missing'));
  }

  function firstMissing() {
    for (const id of required) {
      const el = $(id);
      const min = id === 'payCard' ? 15 : id === 'payExp' ? 5 : id === 'payCvc' ? 3 : 2;
      if (el.value.trim().length < min) return el;
    }
    const email = $('payEmail');
    if (email.value.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim())) return email;
    return null;
  }

  $('payForm').addEventListener('submit', (e) => {
    e.preventDefault();                       // goes nowhere, by design

    const missing = firstMissing();
    if (missing) {
      for (const id of required) {
        const el = $(id);
        const min = id === 'payCard' ? 15 : id === 'payExp' ? 5 : id === 'payCvc' ? 3 : 2;
        el.classList.toggle('is-missing', el.value.trim().length < min);
      }
      missing.classList.add('is-missing');
      missing.focus();
      return;                                 // they stay put until it is filled
    }

    const name = $('payName').value.trim();
    const phone = $('payPhone').value.trim();
    const email = $('payEmail').value.trim();
    const booking = { name, phone, email, paid: q.dueNow };
    const gcal = calendarLink(booking);
    const sentToOwner = sendToOwnerCalendar(bookingDetails(booking), booking);
    $('payDemo').innerHTML = `
      <p class="pay-warn"><b>Nothing was charged.</b> This is a demo screen with no
        payment processor behind it.</p>
      <div class="pay-done">
        <div class="pay-done-mark">✓</div>
        <h3>This is where ${money(q.dueNow)} would be taken</h3>
        <p>In the finished version that ${state.payChoice === 'full' ? 'full payment' : 'deposit'}
           is charged through ${esc(business.owner.split(' ')[0])}'s booking account and the
           slot is held${state.payChoice === 'full' ? '' : `, leaving ${money(q.balance)} for the day`}.
           To switch that on, set <code>payments.mode</code> to
           <code>"acuity"</code> in <code>data.js</code>.</p>
        <div class="pay-done-actions">
          <a class="btn btn-white btn-sm" href="${esc(gcal)}" target="_blank" rel="noopener">
            Add to Google Calendar
          </a>
          <button class="btn btn-outline btn-sm" type="button" id="payAgain">Back</button>
        </div>
        <p class="pay-cal-note">
          ${sentToOwner
            ? `This booking has been sent to ${esc(business.owner.split(' ')[0])}'s calendar
               automatically. The button adds it to yours too.`
            : `Opens a ready-made event with ${esc(name)}'s name, phone${email ? ', email' : ''},
               the service and the amount. To have every booking reach her calendar on its own,
               set up google-calendar/README.md.`}
        </p>
      </div>`;
    $('payAgain').addEventListener('click', renderPaymentDemo);
  });
}

function showConfirmStep() {
  const price = (allServices.find((x) => x.label === state.service) || {}).price;
  const bits = [state.service];
  if (state.date) bits.push(`${MONTHS[state.date.getMonth()]} ${state.date.getDate()}`);
  if (state.time !== null) bits.push(fmt(state.time));
  if (price != null) bits.push(money(price));

  const tail = payments.mode === 'demo'
    ? ''
    : ` — pick this time below to confirm and pay your ${money(business.deposit)} deposit.`;
  $('embedChosen').innerHTML =
    `<b>${esc(bits[0])}</b> · ${bits.slice(1).map(esc).join(' · ')}${tail}`;

  $('booker').hidden = true;
  $('embedWrap').hidden = false;

  if (payments.mode === 'demo') {
    $('embedFrame').hidden = true;
    $('embedHelp').hidden = true;
    renderPaymentDemo();
  } else {
    $('payDemo').hidden = true;
    buildEmbed();
  }
}

function showPickerStep() {
  $('embedWrap').hidden = true;
  $('booker').hidden = false;
}

function openBooker(service) {
  if (service) {
    state.service = service;
    $('svcSelect').value = service;
  }
  showPickerStep();
  updateSummary();
  if (typeof dlg.showModal === 'function') {
    if (!dlg.open) dlg.showModal();
  } else {
    dlg.setAttribute('open', '');       // very old browsers
  }
  document.body.style.overflow = 'hidden';
}

$('sumGo').addEventListener('click', showConfirmStep);

/* ---------- policies popup ---------- */
const polDlg = $('polDlg');
document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-open-policies]')) return;
  if (typeof polDlg.showModal === 'function') {
    if (!polDlg.open) polDlg.showModal();
  } else {
    polDlg.setAttribute('open', '');
  }
  document.body.style.overflow = 'hidden';
});
$('polDlgClose').addEventListener('click', () => polDlg.close());
polDlg.addEventListener('click', (e) => { if (e.target === polDlg) polDlg.close(); });
polDlg.addEventListener('close', () => { document.body.style.overflow = ''; });
$('embedBack').addEventListener('click', showPickerStep);

function closeBooker() {
  if (typeof dlg.close === 'function') dlg.close();
  else dlg.removeAttribute('open');
  document.body.style.overflow = '';
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-open-book]')) openBooker();
});
$('bookDlgClose').addEventListener('click', closeBooker);

/* Click the backdrop (outside the panel) to dismiss. */
dlg.addEventListener('click', (e) => { if (e.target === dlg) closeBooker(); });
/* Escape fires dialog's own close event — keep body scroll in sync. */
dlg.addEventListener('close', () => {
  document.body.style.overflow = '';
  showPickerStep();                      // next open starts at step one
});

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
