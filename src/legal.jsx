/* ──────────────────────────────────────────────────────────────
   Privacy policy and terms.

   Written from what the code actually does, not from a template. Every
   third party named here is one the app really contacts; every field
   listed is one it really stores. If the app changes, this has to change
   with it — a privacy policy that describes a different product is worse
   than none, because it is a promise you are not keeping.

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
    `Short version: we keep what you type into Reamp so the app works, we don't sell it, we don't track you, and you can take it with you or delete it whenever you like.`,
    `The rest of this page is the detail — written in plain language, and describing what the app actually does today rather than what a template says.`],

  ["What we store",
    `When you create an account: your email address, the username you choose, and a password. The password is hashed by our authentication provider — it is never stored in a form anyone can read, including us.`,
    `What you enter while using Reamp: the products in your inventory, what you paid, what you sold them for, your sales, your watchlist, your fee and shipping settings, and — if you provide them — your state, ZIP code and search radius. Location is optional and used only to find local listings.`,
    `We do not ask for your real name, phone number, address, or any payment card details.`],

  ["What we'll never do",
    `We think you should know what isn't happening here, because plenty of apps do all of it.`,
    `We don't sell your data. Not to advertisers, not to data brokers, not to anyone — there's no version of Reamp where your numbers become someone else's product.`,
    `We don't track you. No analytics, no advertising pixels, no third-party trackers anywhere in the app. Nobody is watching which screens you visit or building a profile of you.`,
    `We don't share your figures with other people. What you bought, what you sold it for and what you made is yours. Nobody else using Reamp can see any of it.`,
    `And we won't quietly change any of that. If it ever does change, we'll tell you in the app rather than editing this page and hoping you don't notice.`],

  ["Who processes your data",
    `Reamp is built on services that necessarily see some of your information:`,
    `Supabase — stores your account and your data, sends account emails. Your inventory and sales live in their database.`,
    `Vercel — serves the website. Sees the usual web request information, including your IP address.`,
    `Anthropic — powers the assistant. See the next section for exactly what is sent.`,
    `Tavily — performs the marketplace searches. Receives the product terms you search for, not your identity.`,
    `Resend — delivers account emails such as password resets. Receives your email address.`,
    `Have I Been Pwned — checks whether a password you choose has appeared in a known breach. Your password is never sent: it is hashed in your browser and only the first five characters of that hash leave your device, so nobody can tell which password was being checked.`,
    `Google Fonts — serves the typefaces. Google sees your IP address when the page loads.`],

  ["What the assistant is told",
    `When you use the assistant, and only then, we send it a summary of your business so it can answer usefully: your inventory titles, quantities and costs, your revenue and profit totals, your best-performing marketplace and product, your watchlist, and your location settings.`,
    `You can switch this off. Settings → "Personalize with my business data". With it off, the assistant is told only which screen you are on, and none of your figures are sent.`,
    `Your conversations are processed to produce a reply. They are not used to train models.`],

  ["Links to marketplaces",
    `Reamp links out to eBay, Mercari, Vinted, Poshmark, Depop, OfferUp and Facebook Marketplace. Following one of those links takes you to their site, where their own privacy policy applies and they can see your visit. We are not affiliated with any of them.`],

  ["Cookies and local storage",
    `Reamp does not use advertising or tracking cookies. It stores your login session and a copy of your own data in your browser, so the app opens quickly and keeps working when your connection drops. Signing out removes the session. Clearing your browser data removes the local copy; your account data stays on our servers.`],

  ["How long we keep it",
    `Your data stays while your account exists. Delete your account and everything belonging to it is removed from our database immediately — inventory, sales, watchlist, profile and settings. Backups may retain a copy for a short period before they roll over.`],

  ["Your choices",
    `Export — Settings → Export my data gives you everything we hold, as a file.`,
    `Delete — Settings → Delete my account removes your account and your data. It cannot be undone.`,
    `Turn off assistant personalization — Settings → "Personalize with my business data".`,
    `Depending on where you live you may have further rights over your data. Write to us and we will help.`],

  ["Children",
    `Reamp is not intended for anyone under 13, and we do not knowingly collect their information. If you believe a child has created an account, contact us and we will remove it.`],

  ["Changes",
    `If this changes in a way that matters, we will say so in the app rather than quietly editing the page.`],

  ["Contact",
    `NEEDS YOUR ANSWER — confirm this address works: ${SUPPORT_EMAIL}`],
];

export const TERMS = [
  [null,
    `These are the rules for using Reamp. Using it means you accept them.`],

  ["What Reamp is",
    `Reamp is a tool for tracking resale inventory and sales, and for researching what is selling on public marketplaces. It is a record-keeping and research tool. It is not financial, investment, tax or legal advice.`],

  ["Estimates are estimates",
    `This is the most important thing on this page. Demand, competition, saturation, sold counts, trends and any projected figures in Reamp are estimates drawn from public marketplace listings and reference data. They are not guarantees, predictions or promises of income.`,
    `Search does not see every sale. Counts shown are a floor, not a total. Figures labelled estimated are modelled, not measured. Whether something sells, and for how much, depends on factors Reamp cannot see.`,
    `Decisions about what to buy and what to sell are yours. You are responsible for them, including any money you lose.`],

  ["Your account",
    `Keep your password to yourself and use one you have not used elsewhere. You are responsible for what happens under your account. Tell us promptly if you think someone else has got into it.`,
    `One person, one account. Do not share logins.`],

  ["Acceptable use",
    `Do not use Reamp to break the law, to infringe anyone's rights, or to abuse the service — no automated scraping of our search results, no attempts to get around rate limits or access other people's accounts, no reselling access to Reamp itself.`,
    `We limit how often searches and sign-in attempts can be made. Those limits exist to keep the service working and its costs sane.`],

  ["Marketplace data",
    `Product and listing information comes from publicly available marketplace pages. Reamp is not affiliated with, endorsed by, or partnered with eBay, Mercari, Vinted, Poshmark, Depop, OfferUp or Facebook Marketplace. Their trademarks belong to them.`,
    `Reamp does not buy, sell, list or ship anything on your behalf, and is not party to any transaction you make.`],

  ["Availability",
    `We try to keep Reamp running, but we do not promise it will always be available or error-free. It depends on services we do not control, and parts of it can stop working when those do. We may change or withdraw features.`,
    `Reamp is provided as is, without warranties of any kind.`],

  ["Liability",
    `To the extent the law allows, we are not liable for lost profits, lost sales, lost data, or any indirect or consequential loss arising from using Reamp. Where liability cannot be excluded, it is limited to what you have paid us in the previous twelve months.`],

  ["Ending it",
    `You can delete your account at any time from Settings. We may suspend or close an account that breaks these terms or puts the service at risk. If we do, we will tell you why where we reasonably can.`],

  ["Changes",
    `We may update these terms. If a change matters, we will say so in the app. Continuing to use Reamp after that means you accept the new version.`],

  ["Governing law",
    `These terms are governed by the laws of the United States. Any dispute arising from them will be handled in the United States.`],

  ["Contact",
    `NEEDS YOUR ANSWER — confirm this address works: ${SUPPORT_EMAIL}`],
];
