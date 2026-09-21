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
    `We keep what you type into Reamp so the app works. We don't sell it, we don't track you, and you can take it with you or delete it whenever you like.`],

  ["What we store",
    `Your email, your username, and a password we never see in readable form. Then whatever you put in: your inventory, what you paid, what you sold things for, your watchlist, your settings, and your state and ZIP if you choose to give them.`,
    `We never ask for your real name, your phone number, your address or a card.`],

  ["What we'll never do",
    `Sell your data. Not to advertisers, not to data brokers, not to anyone.`,
    `Track you. No analytics, no ad pixels, no third-party trackers anywhere in the app.`,
    `Show your figures to anyone else. What you bought and what you made is yours alone.`,
    `Change any of that quietly. If it ever changes, we'll tell you in the app.`],

  ["Services we rely on",
    `Reamp runs on other companies' infrastructure — hosting, email, search, the assistant. We don't publish which ones.`,
    `Each only sees what it needs to do its job, none of them may sell your data or use it for advertising, and we'll name them for anyone who asks.`,
    `One worth knowing: when you pick a password we check it against a public list of breached passwords. Your password never leaves your device — only the first five characters of a scrambled version of it do, which can't be traced back to you.`],

  ["What the assistant is told",
    `Only when you use it, and only a summary of your own business — your inventory, your totals, your watchlist, your location settings — so it can answer properly.`,
    `Switch it off in Settings → "Personalize with my business data" and it's told nothing but which screen you're on. Either way, your conversations are never used to train models.`],

  ["Your data, your call",
    `Export it — Settings → Export my data hands you everything we hold, in one file.`,
    `Delete it — Settings → Delete my account wipes your account and everything in it, for good.`,
    `Wherever you live, if you have further rights over your data, write to us and we'll sort it out.`],

  ["Odds and ends",
    `No advertising or tracking cookies. Your login and a copy of your own data sit in your browser so the app opens fast and survives a dropped connection.`,
    `Links to eBay, Mercari, Vinted, Poshmark, Depop, OfferUp and Facebook Marketplace take you to their sites, where their rules apply. We're not affiliated with any of them.`,
    `Reamp isn't for under-13s. If a child has an account, tell us and we'll remove it.`],

  ["Contact",
    `NEEDS YOUR ANSWER — confirm this address works: ${SUPPORT_EMAIL}`],
];

export const TERMS = [
  [null,
    `The rules for using Reamp. Using it means you accept them.`],

  ["What Reamp is",
    `A tool for tracking your resale inventory and sales, and for researching what's selling on public marketplaces. That's all it is — not financial, investment, tax or legal advice.`],

  ["Estimates are estimates",
    `The most important line on this page. Demand, competition, saturation, sold counts and trends are estimates drawn from public listings. They are not guarantees, predictions or promises of income.`,
    `Search never sees every sale, so counts are a floor, not a total. Anything labelled estimated is modelled, not measured.`,
    `What you buy and what you sell is your decision, and your risk — including any money you lose.`],

  ["Your account",
    `One person, one account. Use a password you haven't used elsewhere, keep it to yourself, and tell us if you think someone else is in there. What happens under your account is your responsibility.`],

  ["Fair use",
    `Don't break the law with it, don't scrape our search results, don't try to get around rate limits or into other people's accounts, and don't resell access to Reamp.`,
    `We cap how often searches and sign-ins can run. That's what keeps the service up and its costs sane.`],

  ["Marketplace data",
    `Listing information comes from public marketplace pages. Reamp isn't affiliated with, endorsed by or partnered with eBay, Mercari, Vinted, Poshmark, Depop, OfferUp or Facebook Marketplace, and their trademarks are theirs.`,
    `Reamp doesn't buy, sell, list or ship anything for you, and isn't part of any deal you make.`],

  ["Availability and liability",
    `We'll do our best to keep Reamp running, but it's provided as is, without warranties. It leans on services we don't control, and features can change or go away.`,
    `As far as the law allows, we're not liable for lost profits, lost sales, lost data or any knock-on loss from using Reamp. Where liability can't be excluded, it's capped at what you've paid us in the last twelve months.`],

  ["Ending it, and changes",
    `Delete your account any time from Settings. We may close an account that breaks these rules or puts the service at risk, and we'll say why where we reasonably can.`,
    `If we update these terms in a way that matters, we'll tell you in the app. Carrying on using Reamp after that means you accept the new version.`],

  ["Governing law",
    `These terms are governed by the laws of the United States, and any dispute will be handled there.`],

  ["Contact",
    `NEEDS YOUR ANSWER — confirm this address works: ${SUPPORT_EMAIL}`],
];
