/* ──────────────────────────────────────────────────────────────
   Privacy policy and terms.

   Written from what the code actually does, not from a template. Every
   field listed is one it really stores; every processor described is one
   the app really contacts. If the app changes, this has to change with
   it — a privacy policy that describes a different product is worse than
   none, because it is a promise you are not keeping.

   Short on purpose. Nobody reads a wall of legal text, and a policy that
   goes unread protects nobody — so every section here is a few lines that
   a person will actually finish. Brevity is a feature of this file. Resist
   padding it back out.

   What brevity must never cost: the suppliers are described by what they
   do rather than named, because the owner would rather not publish the
   stack, and that is only honest while the page still says those companies
   exist, that they may not sell your data, and that the names are
   available on request. Cut that and the section becomes a silence, which
   is worse than the long version ever was.

   One thing in here still needs a human decision and is marked NEEDS YOUR
   ANSWER in the text: the support address. Governing law is settled — the
   United States.

   A caveat worth leaving written down: US contract law is state law, not
   federal. Naming the country is enough to be going on with, but a lawyer
   would name a state. Changing it later is one line.
   ────────────────────────────────────────────────────────────── */

export const LEGAL_UPDATED = "21 September 2026";
export const SUPPORT_EMAIL = "support@reamp.store";

/* Each document is a list of [heading, ...paragraphs]. Kept as data rather
   than markup so the same content can be rendered anywhere. */

export const PRIVACY = [
  [null,
    `We keep what you type into Reamp so the app works. We don't sell it, we don't track you, and you can take it or delete it whenever you like.`],

  ["What we store",
    `Your email, username and a password we never see. Plus whatever you enter: inventory, costs, sales, watchlist, settings, and your state and ZIP if you give them.`,
    `Never your real name, phone, address or card.`],

  ["What we'll never do",
    `Sell your data — to advertisers, data brokers or anyone.`,
    `Track you. No analytics, no ad pixels, no third-party trackers.`,
    `Show your figures to anyone else.`,
    `Change any of that quietly.`],

  ["Services we rely on",
    `Reamp runs on other companies' infrastructure — hosting, email, search, the assistant — and we don't publish which ones. None of them may sell your data or use it for advertising, and we'll name them for anyone who asks.`,
    `Your password never leaves your device: we check it against a public breach list using only the first five characters of a scrambled version of it.`],

  ["What the assistant is told",
    `Only when you use it, and only a summary of your own business so it can answer properly. Switch it off in Settings → "Personalize with my business data". Your conversations are never used to train models.`],

  ["Your data, your call",
    `Settings → Export my data hands you everything we hold. Settings → Delete my account wipes it for good. Anything else, write to us.`],

  ["Odds and ends",
    `No ad or tracking cookies — your login and a copy of your data sit in your browser so the app opens fast.`,
    `Links to eBay, Mercari, Vinted, Poshmark, Depop, OfferUp and Facebook Marketplace go to their sites, where their rules apply. We're not affiliated with any of them.`,
    `Reamp isn't for under-13s.`],

  ["Contact",
    `NEEDS YOUR ANSWER — confirm this address works: ${SUPPORT_EMAIL}`],
];

export const TERMS = [
  [null,
    `The rules for using Reamp. Using it means you accept them.`],

  ["What Reamp is",
    `A tool for tracking your resale inventory and sales, and researching what's selling on public marketplaces. Not financial, investment, tax or legal advice.`],

  ["Estimates are estimates",
    `Demand, competition, saturation, sold counts and trends are estimates drawn from public listings. They are not guarantees, predictions or promises of income.`,
    `Search never sees every sale, so counts are a floor, not a total. What you buy and sell is your decision and your risk, including any money you lose.`],

  ["Your account",
    `One person, one account. Use a password you haven't used elsewhere and keep it to yourself — what happens under your account is your responsibility.`],

  ["Fair use",
    `Don't break the law with it, scrape our results, dodge the rate limits, get into other people's accounts, or resell access to Reamp.`],

  ["Marketplace data",
    `Listing information comes from public marketplace pages. We're not affiliated with eBay, Mercari, Vinted, Poshmark, Depop, OfferUp or Facebook Marketplace, and we don't buy, sell, list or ship anything for you.`],

  ["Availability and liability",
    `Reamp is provided as is, without warranties, and features can change or go away.`,
    `As far as the law allows, we're not liable for lost profits, sales, data or any knock-on loss. Where liability can't be excluded, it's capped at what you've paid us in the last twelve months.`],

  ["Ending it, and changes",
    `Delete your account any time from Settings. We may close one that breaks these rules. If we update these terms in a way that matters, we'll tell you in the app.`],

  ["Governing law",
    `Governed by the laws of the United States, where any dispute will be handled.`],

  ["Contact",
    `NEEDS YOUR ANSWER — confirm this address works: ${SUPPORT_EMAIL}`],
];
