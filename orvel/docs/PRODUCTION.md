# Taking ORVEL to production

The prototype runs its rules engine in the browser. Production moves that
engine behind an authenticated API so that the client holds nothing but a
read-only snapshot. The function names in `src/server/game.js` are already
the API surface; the client in `src/store.jsx` calls `server.<method>()`,
so swapping the in-browser object for an HTTP client is a contained change.

## 1. Server and database

Any backend works. Supabase fits well (Postgres + Auth + Storage + Edge
Functions), and the tables map directly:

```sql
create table rarities (id text primary key, name text unique not null, sort int not null,
  weight numeric not null check (weight >= 0), sell_value int not null check (sell_value >= 0),
  xp int not null default 0, color text, color2 text, effect text not null);

create table cards (id uuid primary key default gen_random_uuid(), code text unique not null,
  name text not null, name_lc text generated always as (lower(name)) stored unique,
  description text, rarity_id text not null references rarities(id),
  collection_number int unique not null check (collection_number > 0),
  sell_value int check (sell_value >= 0), image_path text not null, fit text not null default 'contain',
  limited_size int, minted int not null default 0 check (limited_size is null or minted <= limited_size),
  published boolean not null default false, created_at timestamptz default now());
create index cards_name_trgm on cards using gin (name_lc gin_trgm_ops);   -- fast partial-name search

create table packs (...);                       -- mirrors the pack object in defaults.js
create table card_packs (card_id uuid references cards, pack_id text references packs, primary key (card_id, pack_id));
create table collections (...); create table card_collections (...);

create table players (id uuid primary key references auth.users, name text, cash bigint not null default 0 check (cash >= 0),
  xp bigint not null default 0, last_daily date);
create table inventory (player_id uuid references players, card_id uuid references cards,
  count int not null check (count >= 0), primary key (player_id, card_id));
create table serials (card_id uuid references cards, serial int, player_id uuid references players,
  primary key (card_id, serial));
create table transactions (id uuid primary key default gen_random_uuid(), player_id uuid, type text not null,
  amount bigint, detail jsonb, created_at timestamptz default now());       -- append-only
create table orders (id uuid primary key, player_id uuid, pack_id text, amount_cents int, currency text,
  status text not null, provider text, provider_ref text unique, odds_shown jsonb, created_at timestamptz, fulfilled_at timestamptz);
```

Rules for the server code:

- **Every mutation is one database transaction** with row locks
  (`select … for update` on the player row). Purchase = check balance,
  debit, draw, insert inventory, insert transaction, commit — or roll back.
- **Players can read only their own rows** (row-level security). No client
  ever writes `cash`, `inventory`, `minted` or `orders` directly.
- **Draw on the server** with a CSPRNG (`crypto.getRandomValues` in Deno /
  Node). Store the odds snapshot that was shown with each order.
- **Admin is a role on a real account**, checked server-side on every
  admin call. Drop the prototype PIN.
- **Artwork goes to object storage** (Supabase Storage, S3, R2) uploaded
  unmodified; serve through a CDN. If you want smaller grid thumbnails,
  generate them as *extra* files and keep the original for the viewer and
  zoom.

## 2. Real-money payments

The prototype already follows the correct shape:

```
client ──createOrder──▶ server (pending order, price from DB, never from client)
client ──redirect────▶ provider-hosted checkout / app-store sheet
provider ─webhook────▶ server (verify signature → fulfil once → record)
client ◀─poll/push──── server (opening result)
```

To go live, replace `_simulateProviderEvent` and the HMAC check in
`handlePaymentWebhook` with the provider's SDK and signature verification.

- **Web:** Stripe Checkout, Paddle, or a merchant of record. Card details
  stay on the provider's page; ORVEL never sees them.
- **iOS / Android apps:** digital goods must use Apple In-App Purchase and
  Google Play Billing. Verify receipts server-side (App Store Server API /
  Play Developer API) before fulfilling.
- Make fulfilment idempotent on the provider's event or transaction id
  (`orders.provider_ref unique`) — providers retry webhooks.
- Handle refunds and chargebacks: decide whether a refunded pack's cards are
  revoked, and record it either way.

## 3. Before selling randomized packs for money

Paid random packs are regulated as loot boxes in a growing number of places.
This is a checklist to work through with a lawyer, not legal advice:

- [ ] **Odds disclosure** — already built: every pack shows effective
      per-rarity odds, guaranteed slots and pool size before purchase, and
      the shown odds are stored with each order. Apple and Google both
      require this.
- [ ] **Jurisdictions** — some countries restrict or ban paid loot boxes
      (Belgium has treated them as gambling; the Netherlands, others vary).
      Geo-restrict real-money packs where required.
- [ ] **Age** — the checkbox is a placeholder. Use platform age signals or
      verified age, and parental controls for minors where required.
- [ ] **No cash-out** — keep ORVEL Cash non-redeemable and cards
      non-transferable for money. A real-money exit can turn a game into
      gambling in many jurisdictions. (The current design already has none.)
- [ ] **Consumer protection** — clear prices with tax, receipts, refund
      policy, terms of service, privacy policy, spending limits or
      history visible to the player.
- [ ] **Platform rules** — App Store Review Guideline 3.1.1 and Google Play's
      payments and loot-box policies.
- [ ] **Arena wagers** — betting cards or coins on a duel, where cards and coins can be obtained with real money, is closer to gambling than packs are. Check this specifically, keep it in-game-only, and keep rivals clearly labelled as computer-controlled.
- [ ] **Records** — keep transaction and order history (the schema above is
      append-only for this reason).

Until those are settled, leave **Settings → Show real-money prices** off,
or keep it on with the simulated checkout for testing only.
