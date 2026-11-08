// Default configuration for a brand-new ORVEL install.
// Everything here is editable from the admin dashboard; these are only the
// values a fresh database starts with.

// minValue–maxValue is the selling range for cards of that rarity. Each card
// has its own value inside the range (set per card in the editor);
// `sellValue` is what a card is worth if it has no value of its own.
export const DEFAULT_RARITIES = [
  { id: 'r1', name: 'Drift',       weight: 6800, minValue: 5,     maxValue: 15,     sellValue: 8,     xp: 2,   color: '#8fa3b8', color2: '#3d4b5c', effect: 'matte' },
  { id: 'r2', name: 'Hollowglass', weight: 2400, minValue: 20,    maxValue: 50,     sellValue: 30,    xp: 5,   color: '#7fe7ff', color2: '#2a6f8f', effect: 'glass' },
  { id: 'r3', name: 'Riftmarked',  weight: 600,  minValue: 60,    maxValue: 180,    sellValue: 100,   xp: 12,  color: '#ff5c8a', color2: '#7a1240', effect: 'rift' },
  { id: 'r4', name: 'Starwrought', weight: 180,  minValue: 250,   maxValue: 750,    sellValue: 400,   xp: 30,  color: '#ffd166', color2: '#8a5a00', effect: 'star' },
  { id: 'r5', name: 'Voidcrowned', weight: 12,   minValue: 1000,  maxValue: 10000,  sellValue: 2500,  xp: 80,  color: '#b388ff', color2: '#24063f', effect: 'void' },
  { id: 'r6', name: 'Origin Zero', weight: 1,    minValue: 50000, maxValue: 100000, sellValue: 60000, xp: 250, color: '#ffffff', color2: '#ff3df2', effect: 'origin' },
]

// The v1 defaults, kept so an existing save can tell whether the creator has
// customised a rarity or pack before the v2 economy is applied to it.
export const V1_RARITY_DEFAULTS = { r1: [6200, 5], r2: [2500, 15], r3: [900, 45], r4: [300, 140], r5: [90, 450], r6: [10, 2000] }
export const V1_PACK_PRICES = { 'pk-drift': 100, 'pk-rift': 250, 'pk-void': 900, 'pk-firstlight': 400 }

// Visual effects a rarity can wear. Separate from the rarity itself so a
// renamed or reordered rarity keeps (or swaps) its look deliberately.
export const EFFECTS = [
  { id: 'matte',  label: 'Matte steel' },
  { id: 'glass',  label: 'Hollow glass sheen' },
  { id: 'rift',   label: 'Rift fracture pulse' },
  { id: 'star',   label: 'Starforged gold foil' },
  { id: 'void',   label: 'Void crown aura' },
  { id: 'origin', label: 'Origin prism (holographic)' },
]

export const DEFAULT_COLLECTIONS = [
  { id: 'col-nocturne', name: 'Nocturne', description: 'Night skies, moonlit water and the quiet hours.' },
  { id: 'col-ember',    name: 'Ember Season', description: 'Warm light, fire and long sunsets.' },
  { id: 'col-signal',   name: 'Lost Signal', description: 'Machines, static and transmissions from nowhere.' },
]

export const DEFAULT_PACKS = [
  {
    id: 'pk-drift', name: 'Drift Starter', tagline: 'Where every collection begins',
    description: 'Three cards from the full ORVEL catalog. The cheapest way to start filling your binder.',
    priceCash: 250, priceUsd: null, cardCount: 3, poolMode: 'all',
    rarityWeights: null, guarantee: null,
    active: true, featured: false, premium: false,
    limited: { enabled: false, stock: 0, sold: 0, endsAt: null },
    design: { c1: '#1b2a4a', c2: '#3fa7d6', c3: '#a8f0ff', emblem: 'wave' }, sort: 1,
  },
  {
    id: 'pk-rift', name: 'Rift Booster', tagline: 'Five cards, one guaranteed Hollowglass or better',
    description: 'A standard booster. The final card is always Hollowglass or rarer.',
    priceCash: 550, priceUsd: 1.99, cardCount: 5, poolMode: 'all',
    rarityWeights: null, guarantee: { minRarityId: 'r2' },
    active: true, featured: true, premium: false,
    limited: { enabled: false, stock: 0, sold: 0, endsAt: null },
    design: { c1: '#3a0b2a', c2: '#ff5c8a', c3: '#ffd1e0', emblem: 'rift' }, sort: 2,
  },
  {
    id: 'pk-void', name: 'Voidcrown Vault', tagline: 'Premium: Starwrought or better guaranteed',
    description: 'Five cards with boosted odds for the top three tiers. The last card is always Starwrought or rarer.',
    priceCash: 3500, priceUsd: 4.99, cardCount: 5, poolMode: 'all',
    rarityWeights: { r1: 2500, r2: 3800, r3: 2800, r4: 800, r5: 60, r6: 5 },
    guarantee: { minRarityId: 'r4' },
    active: true, featured: false, premium: true,
    limited: { enabled: false, stock: 0, sold: 0, endsAt: null },
    design: { c1: '#0d0221', c2: '#7b2ff7', c3: '#f1c0ff', emblem: 'crown' }, sort: 3,
  },
  {
    id: 'pk-firstlight', name: 'First Light', tagline: 'Limited edition — Nocturne cards only',
    description: 'A limited run drawing only from cards assigned to this pack. When the stock is gone, it is gone.',
    priceCash: 600, priceUsd: 2.99, cardCount: 4, poolMode: 'tagged',
    rarityWeights: null, guarantee: { minRarityId: 'r3' },
    active: true, featured: false, premium: false,
    limited: { enabled: true, stock: 500, sold: 0, endsAt: null },
    design: { c1: '#05122b', c2: '#ffd166', c3: '#fff4d1', emblem: 'star' }, sort: 4,
  },
]

// Ranks measure dedication, not luck: XP comes from opening packs, finding
// new cards and completing the catalog. Labels are placeholders on purpose.
export const DEFAULT_RANKS = [
  0, 150, 400, 900, 1700, 3000, 5000, 8000, 12500, 20000,
].map((xp, i) => ({ id: `rank${i + 1}`, label: `Rank ${i + 1}`, xp }))

export const DEFAULT_XP_RULES = {
  perPack: 10,        // every pack opened
  perNewCard: 25,     // first copy of a card you didn't own
  perSale: 1,         // every card sold back
  // plus each rarity's own `xp` value per card pulled
}

export const DEFAULT_SETTINGS = {
  currencyName: 'ORVEL Cash',
  startingCash: 1000,
  dailyReward: 150,
  realMoneyEnabled: true,   // shows the simulated checkout in the prototype
  minAge: 18,
}

export const XP_BATTLE = { win: 30, friendlyWin: 10 }
