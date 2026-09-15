# Thehairrookiee — booking site

One self-contained file: `index.html`. No build step, no dependencies, no
backend. Open it in a browser and it works.

## Where it lives

It sits in `public/`, so `npm run build` copies it straight through to
`dist/salon/index.html` and it ships with the existing deploy at `/salon/`.
Nothing in the reselling app imports it and it imports nothing from the app —
the two are independent.

To host it on its own domain instead, upload `index.html` anywhere that serves
static files (Netlify drop, Vercel, GitHub Pages, any shared host).

## Editing the business details

Everything the site needs to know is in one object near the top of the
`<script>` block:

```js
var SALON = {
  cashapp:   "thehairrookiee",   // cash.app/$thehairrookiee
  instagram: "thehairrookiee",   // instagram.com/thehairrookiee
  tiktok:    "",                 // handle without the @, or "" to hide the tile
  phone:     "",                 // digits only, e.g. "4045550123"
  deposit:   10
};
```

Set `phone` and two things switch on: a "Text me" tile in the contact section,
and a **Text it to me** button on the last booking step that opens the client's
messaging app with the whole request pre-filled. Leave it `""` and the site
quietly hides both — nothing breaks.

## Hours

```js
var HOURS = { 0:[10,20], 1:[16,21], 2:[16,21], 3:[16,21], 4:[16,21], 5:null, 6:null };
```

`0` is Sunday, values are `[openHour, closeHour]` in 24-hour time, `null` is
closed. Change these and the calendar, the hours table and the bookable start
times all follow — they are generated from this one object.

## Services and prices

`SERVICES` is one row per service:

```js
{ c:"w", n:"Knotless Braids", lo:120, hi:250, p:1, m:300, t:1 }
```

| key | meaning |
|---|---|
| `c` | category — `w` women's cuts, `s` styling, `b` braids, `m` men's cuts |
| `n` | name shown to the client |
| `lo` / `hi` | price range in whole dollars |
| `p` | set to `1` for prices that can run higher (renders a `+`) |
| `m` | minutes in the chair — drives which start times are offered |
| `t` | set to `1` to show the "Trending '26" chip |

`m` is doing real work: a 5-hour braid install only offers start times that
finish before closing, which is why a Monday shows one slot and Sunday shows
several. If a service can't fit a given day at all, the client is told to try
Sunday rather than being shown times that don't exist.

`ADDONS` uses the same shape and is offered on the review step.

## How a booking reaches you

There is no server, so the site doesn't store bookings — it assembles the
request and hands it to the client to send:

1. Service → day and time → name and phone → review
2. They tick the policy acknowledgement (deposit, coming alone, arriving prepped)
3. **Send booking request** copies the formatted request to their clipboard and
   moves them to the last step
4. That step offers: text it (if `phone` is set), open your Instagram DMs, copy
   again, and a Cash App button pre-filled with the $10 deposit

The request is also saved in their browser so a returning client sees what they
last asked for.

If you'd rather bookings land somewhere automatically, the repo already has
Supabase — a `bookings` table plus a small Edge Function would replace step 3
with a real write. That's a separate piece of work; nothing here has to change
to make room for it.
