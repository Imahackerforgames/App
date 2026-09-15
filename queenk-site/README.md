# Queen K Beauty Etc — website

A black-and-white one-page site for **Queen K Beauty Etc** (Queenie K Deloach)
in Savannah, GA.

Plain HTML, CSS and JavaScript. No build step, no dependencies, no install.

## Run it

```bash
cd queenk-site
python3 -m http.server 8000
# visit http://localhost:8000
```

(It uses ES modules, so it needs to be served rather than opened as a file.)

## Edit it

**`data.js` is the only file you need to touch.** Styles, prices, add-ons,
hours, fees, policies, reviews and FAQ all come from there.

### Draft mode

`DRAFT_MODE = true` at the top of `data.js` shows a red banner and stamps every
unconfirmed price as a **Sample**, so nothing invented can go live by accident.
Set it to `false` once the real prices are in.

## Payments and scheduling run on her existing Acuity account

Booking happens in two steps inside the popup, and **no button anywhere on
this site links out to the old booking page**:

1. **Pick** — style, day and time, in this site's own panel.
2. **Confirm & pay** — her real Acuity scheduler loads *inside the popup*
   (`business.embedSrc` in `data.js`), where the client confirms the slot
   and pays the deposit. Availability, the $25 deposit and the card payment
   are all handled by the Acuity account she already uses, so nothing about
   her setup has to change.

### Two payment modes

`payments.mode` in `data.js` decides what step two shows:

| Mode | What happens |
|---|---|
| `"acuity"` | Her real booking page runs in the popup, takes the card and pays her. This is the live path. |
| `"demo"` | A mock-up of a payment screen. **Connected to nothing** — no processor, no network call, nothing stored, no money moved. For designing the screen before a backend exists. |

**It currently ships as `"demo"`.** Switch it to `"acuity"` before any real
client uses the site. The demo screen carries a permanent warning banner
that is part of its markup rather than an option, so it cannot render
without it, and a test confirms submitting it makes zero network requests.

### Deposit or pay in full

The payment screen offers both. The deposit is the flat amount in
`business.deposit`; paying in full charges the service price **plus any
surcharge the chosen slot carries** — a $175 style booked on a Sunday
evening comes to $250, and the deposit option shows $225 still owed on the
day. Both figures come from `quote()` in `app.js`, which is the single
place the cost is worked out, so the summary bar and the payment screen
cannot disagree.

Note that in `"acuity"` mode this choice belongs to her Acuity account
rather than to this site — whether a service takes a deposit or the full
amount is configured per appointment type there.

### When you wire up a real processor

Do **not** collect card numbers in this page's own inputs. Use
[Stripe Elements](https://stripe.com/docs/payments/elements) or
[Square Web Payments](https://developer.squareup.com/docs/web-payments/overview):
both render the card field inside their own iframe, so the number goes
straight to the processor and never passes through this site. That is what
keeps the business out of PCI scope. The mount point is marked in `app.js`
where `renderPaymentDemo` sits — delete that function and mount the real
one in its place.

### This needs a real domain

Browsers only allow a site to embed another site's page when the host
permits it. Opened from a local file, or from a sandboxed preview link, the
scheduler area comes up blank. **Deploy the site to a real host and it
works.** There is no way for a page to detect the difference — a browser
reports a refused cross-site frame exactly like a successful one — so
rather than guess, the confirm step always shows a quiet line offering her
phone number.

Two things to check on her side once it's deployed:

- **Payments must be switched on in Acuity** for the deposit to be charged
  in the embed. If they aren't, the client books but pays on arrival.
- **Deep links per service** are possible. Each appointment type in Acuity
  has its own scheduling link; drop one into a service's entry in
  `data.js` and pressing Book can open straight to that service instead of
  the full category list.

## The booking flow

Step one of the popup is this site's own picker:

1. **Choose a style** — a dropdown of every service, or tap *Book* on any price bubble
2. **Pick a day** — a real calendar, with Sundays dotted to show the extra fee
3. **Pick a time** — PM slots in 15-minute steps, each showing its own surcharge

The running summary shows the style, date, time, price and any fees, and
**Confirm & pay** moves to step two, above.

Fees are applied exactly as her flyer states them:

| When | Fee |
|---|---|
| Sunday | +$45 |
| After 5:30 PM | +$30 |
| After 7:00 PM | +$40 |

Note these are *after* — a 5:30 PM slot is still standard hours. Slots that
have already passed are hidden on same-day bookings.

Scheduling behaviour is configurable in the `scheduling` block in `data.js`
(slot length, first and last slot, how many months the calendar pages through,
whether Sundays are bookable).

## What's real vs. what still needs her numbers

**Confirmed** — taken from her own flyers and live booking page:

- Phone, email, Instagram, Facebook, Savannah Southside location
- Hours (Mon–Sat, 9:30 AM – 5:30 PM) and every surcharge
- $25 deposit; cash, Cash App and Apple Pay
- All four booking policies and all four salon policies, verbatim
- The pre-appointment checklist
- All nine service categories
- **All ten add-on prices** (Added Curls $30 … Relaxer $80)
- **Entire Head of Color — $70, 1 hr 50 min**

**Still needed:**

| Item | What to do |
|---|---|
| Most service prices | Only Entire Head of Color was readable on the booking page. Everything marked **Sample** needs her real number — set `price` in `data.js` and remove `sample: true`. |
| The four client photos | Save them and drop them into `assets/reviews/` — see the README in that folder. |
| Written reviews | Her flyer has review photos but no quotes. Ask a few clients for a sentence each, put them in `reviews`, set `sample: false`. |

## Deploy

It's a static folder — drag it into Netlify, or point any host at it:

```bash
netlify deploy --dir=queenk-site --prod
```

## Files

| File | Role |
|---|---|
| `index.html` | Page structure |
| `styles.css` | All styling |
| `data.js` | **All content — edit this one** |
| `app.js` | Renders the page and runs the booking calendar |
| `assets/reviews/` | Client photos go here |
