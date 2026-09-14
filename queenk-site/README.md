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

## The booking flow

The site's booking section is the main upgrade over the bare Acuity page:

1. **Choose a style** — a dropdown of every service, or tap *Book* on any price bubble
2. **Pick a day** — a real calendar, with Sundays dotted to show the extra fee
3. **Pick a time** — PM slots in 15-minute steps, each showing its own surcharge

The running summary shows the style, date, time, price, any fees, and the $25
deposit. **Continue to booking** hands off to her real Acuity page, which is
where the deposit is actually taken — this just gets the client there already
decided.

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
