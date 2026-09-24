# Locddatlastt — booking site

`index.html` plus the `img/` folder. No build step, no dependencies, no
backend. Open it in a browser and it works.

## Where it lives

It sits in `public/`, so `npm run build` copies it to `dist/locddatlastt/`
and it ships at `/locddatlastt/`. Nothing in the reselling app touches it and
it touches nothing in the app.

To host it on its own domain, upload `index.html` and `img/` together to any
static host (Netlify drop, Vercel, GitHub Pages, a shared host).

## The images

Cropped out of the screenshots of the existing booking page. Replace any of
them by dropping a new file in `img/` under the same name — the page picks it
up with no code change. Higher-resolution originals will look better; these
came from phone screenshots.

`wordmark.png` is the logo knocked out to a transparent background, so it sits
on any colour.

## Editing the business details

One object at the top of the `<script>`:

```js
var SHOP = {
  phone:       "6786655663",
  email:       "naturallyinterwinned@gmail.com",
  instagram:   "Locddatlastt",
  depositRate: 0.5,        // deposit is half the service total
  openDay:     27,         // next month's calendar opens on the 27th
  slotStep:    60,         // minutes between start times
  mustFinishByClose: true  // false = also offer late starts that run past closing
};
```

### `mustFinishByClose`

**This one needs a decision.** Left `true`, a start time is only offered if the
whole service lands inside opening hours, so a five-hour style stops being
offered after 1pm. Nobody can book a slot that can't be served.

Set it `false` and the last start is simply one slot before close (5pm), the
way the live Acuity page appears to behave — a long style then runs past six.
That fills more of the day but means finishing late.


## Hours

```js
var HOURS = { 0:null, 1:null, 2:[10,18], 3:[10,18], 4:[10,18], 5:[10,18], 6:[10,18] };
```

`0` is Sunday, `[open, close]` in 24-hour time, `null` is closed. The calendar,
the hours table and the bookable start times are all generated from this.

## Services

```js
{ g:"retwist", n:"Standard Retwist", p:125, m:180, img:"svc-retwist.jpg", len:1, d:"..." }
```

| key | meaning |
|---|---|
| `g` | group — `retwist`, `starters`, `natural`, `extended`, `shampoo` |
| `n` | name |
| `p` | price in dollars |
| `m` | minutes |
| `img` | filename in `img/`, or `glyph:"chat"` / `glyph:"drop"` for a drawn mark instead |
| `len` | `1` if the length add-on applies, `0` if not (the consultation) |
| `consult` | `1` to show "book a consultation first" on the review step |
| `flag` | small badge on the tile, e.g. "8+ months locked" |
| `d` | the description shown in the price menu |

`m` drives the calendar: a 5-hour style only offers start times that finish
before 6pm, so it shows fewer slots than a 3-hour retwist.

## Lengths

```js
var LENGTHS = [
  { n:"Shoulder", add:0,  mins:0  },
  { n:"Midback",  add:10, mins:10 },
  { n:"Waist",    add:20, mins:20 },   // confirmed from the live booking page
  { n:"Butt",     add:30, mins:30 },
  { n:"Thigh",    add:40, mins:40 }
];
```

**Waist is the only rung taken from the real booking page.** The other four
follow the same $10-and-10-minutes-per-step ladder that Waist implies. Confirm
the real numbers before sending clients here — they change the price a client
is quoted.

## The "bookings open on the 27th" rule

Clients can book the rest of the current month. From the 27th onward, the
following month opens too, and before the 27th the calendar says when it will.
Change `SHOP.openDay` to move it.

## How a booking reaches you

There is no server, so the site does not store bookings or hold a slot. It
assembles the request and hands it to the client to send:

1. Service and length → day and time → name and phone → review
2. The review shows the service total, the deposit (half) and the balance due
3. They tick the policy acknowledgement and hit **Send my request**
4. That copies the request and offers: text it, email it, or send it on Instagram

The page says plainly that the time is not held until you confirm and the
deposit is in.

See the notes in the handoff conversation for what to add to make this hold
slots, take deposits and keep a record of who paid.
