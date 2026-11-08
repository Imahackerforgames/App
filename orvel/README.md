# ORVEL

A retro collectible card game built around original artwork. Players open
packs, build a collection, search the full catalog, sell cards back for
in-game currency, and climb a rank ladder. The creator manages everything —
cards, rarities, packs, odds, ranks — from a private dashboard.

This is a self-contained project. It shares a repository with Reamp but
nothing else: its own `package.json`, its own build, no shared code.

## Run it

```bash
cd orvel
npm install
npm run dev        # http://localhost:5174
npm test           # rules-engine tests (no browser needed)
npm run build      # static bundle in dist/
```

## First steps as the creator

1. Open **Creator dashboard** (footer link, or `#/admin`) and choose an admin PIN.
2. **Cards → Bulk upload artwork** to drop in many images at once. Each becomes
   an unpublished draft named after its file. Or use **+ New card** for one.
3. Open each draft, set its name, description, **rarity**, collection number,
   sell value, packs and themed collections, check **Full preview**, then
   **Save & publish**.
4. The 30 sample cards (generated placeholder art) can be removed in one click
   from the Cards tab once your own art is in.
5. **Rarities**, **Packs**, **Collections**, **Ranks** and **Settings** are all
   editable; every pack's odds table updates live as you change weights.
6. **Settings → Export catalog** downloads everything, including your original
   artwork, as one file. Do this regularly — see *Where data lives* below.

## What's in it

| Area | Notes |
|---|---|
| Artwork | Stored as the original file. Never resized, recompressed or pixelated. Shown whole (`contain`) over a blurred copy of itself, or `cover` if you choose. Full-screen viewer zooms to 800% with pan and pinch. |
| Rarities | Six tiers by default (Drift → Origin Zero). Name, order, drop weight, colours, effect, default sell value and XP are all editable. Each effect has its own frame, animation and pack reveal. |
| Collection | Whole catalog including uncollected cards (dimmed, marked UNCOLLECTED). Completion overall and per rarity. Arrow keys move between cards in the viewer. |
| Search | Instant, case-insensitive, partial names, multi-word. `ORV-0012` finds by card ID; `#12` or `12` by collection number. Rarity, owned/missing/duplicates and theme filters; six sorts. Index is precomputed and the grid renders progressively, so thousands of cards stay fast. Press `/` to focus. |
| Selling | Single, quantity, "sell duplicates" per card, and bulk "sell all duplicates". Every sale has a confirmation screen; the server re-checks ownership and price at the moment of sale. |
| Shop | Featured section, premium and limited packs, stock counters, end dates, guaranteed-slot packs, exclusive card pools, published drop rates. In-game purchases are real; real-money purchases go through a clearly labelled **simulated** checkout. |
| Pack opening | Tap to tear, reveal one card at a time (rarest last), longer build-up and bigger effects per tier, skip button, summary grid. Cards are awarded *before* the animation starts, so skipping or closing never loses a pull. |
| Ranks | Ten placeholder ranks (`Rank 1`…`Rank 10`), separate from rarity. XP comes from packs opened, new cards discovered, rarity of pulls and sales. Labels and thresholds are editable. |
| Sound | Synthesised menu sounds (no files), mute toggle that persists. CRT effect toggle too. |

## How the rules are protected

All game rules live in one module, `src/server/game.js`, written as a
server: the UI never changes a balance or an inventory itself. It enforces:

- you can only sell copies you own, never fractional or negative quantities;
- a sale is refused if the price changed since the confirmation screen;
- calls are serialized, so ten rapid taps on "Buy" are ten sequential checks
  against the balance, not ten reads of the same balance;
- a failed purchase changes nothing (state commits only on success);
- draws use the platform CSPRNG (`crypto.getRandomValues`), never `Math.random`;
- the odds shown to players are computed by the same function that draws;
- limited-edition cards stop dropping when the edition is minted out;
- a payment event must carry a valid HMAC signature and fulfils at most once;
- admin actions require a signed-in admin session.

`tests/game.test.mjs` covers each of these, including a 9,000-card draw
that checks observed rarity frequencies against the disclosed odds.

## Where data lives (prototype)

In this browser's IndexedDB. That makes the prototype fully playable with no
backend, and it also means:

- each browser is its own world — your catalog is not visible to players on
  other devices until it moves to a server;
- clearing site data erases it — **export your catalog**;
- someone with devtools can edit their own save. The rules engine is
  structured to move server-side precisely so that stops being possible.

`docs/PRODUCTION.md` is the plan for taking it live: server, database,
storage, real payments, and the compliance work required before selling
randomized packs for money.

## Files

```
src/server/game.js       rules engine — the only code that changes game state
src/server/defaults.js   starting rarities, packs, ranks, settings
src/server/rng.js        unbiased CSPRNG helpers
src/store.jsx            React state; calls the server and renders snapshots
src/lib/storage.js       IndexedDB (state + original image blobs)
src/lib/seedArt.js       sample vector artwork for a fresh install
src/lib/sound.js         Web Audio sound effects
src/components/          Card frame, pack art, viewer, pack opening, logo, UI kit
src/pages/               Home, Collection, Shop, Profile, admin/
tests/game.test.mjs      rules-engine tests
```
