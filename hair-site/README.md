# The Hair Rookie — website

A one-page site for **@_thehairrookiee**, a downtown Atlanta stylist
specializing in ponytails, quick weaves and protective styles.

Plain HTML, CSS and JavaScript. No build step, no dependencies, no install.

## Run it

Open `index.html` in a browser — or, because it uses ES modules, serve the
folder:

```bash
cd hair-site
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Edit it

**`data.js` is the only file you need to touch.** Services, prices, gallery,
reviews, policies and FAQ all come from there. Edit, save, refresh.

### Draft mode

`DRAFT_MODE = true` at the top of `data.js` puts a red banner on the page and
stamps every sample price and sample review as a placeholder, so nothing
invented can go live by accident. Set it to `false` once the real content is in.

## What still needs real content

Two things could not be gathered from her existing pages:

| Item | Why | What to do |
|---|---|---|
| **Prices** | No prices are published on the Instagram page, and her Acuity booking page currently shows "Online scheduling is not currently available", so no service list or prices are exposed. The 8 prices in `data.js` are typical downtown-Atlanta rates standing in as placeholders. | Replace each `price` in `services`, then set `sample: false` on it. |
| **Reviews** | The Instagram comments are emoji only (`😍😍😍`) — there was no written review text to pull. | Ask a few past clients for a sentence each, put them in `reviews`, set `sample: false`. |
| **Photos** | Instagram blocks direct image downloads. | Save the photos and drop them in `assets/gallery/` — see the README in that folder. |

## What came from her real pages

These are confirmed, not invented:

- Specialties: **ponytails, quick weaves** (Instagram bio)
- Location: **downtown Atlanta** (Instagram bio)
- **$10 deposit required to book** (Instagram bio)
- **Hair not included** (banner on her Acuity booking page)
- Booking status: "April books open" (Instagram bio — update as it changes)
- Booking link: `https://thehairrookiee.as.me/schedule/5ec63b4f`
- The 8 gallery cards link to her 8 real Instagram posts

### Booking link

`business.bookingOffline` is currently `true` because her Acuity page isn't
taking bookings right now, so the Book buttons point to Instagram DMs instead.
When she switches Acuity back on, set `bookingOffline: false` and a "Book
online" button appears automatically — no other changes needed.

## Deploy

It's a static folder. Drag it into Netlify, or point any host at it:

```bash
# Netlify CLI
netlify deploy --dir=hair-site --prod
```

## Files

| File | Role |
|---|---|
| `index.html` | Page structure |
| `styles.css` | All styling |
| `data.js` | **All content — edit this one** |
| `app.js` | Renders the page from `data.js` |
| `assets/gallery/` | Salon photos go here |
