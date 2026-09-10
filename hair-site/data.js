/* ============================================================
   THE HAIR ROOKIE — site content
   ------------------------------------------------------------
   This is the ONLY file you need to edit to update the site.
   No build step, no npm install. Edit, save, refresh.

   ⚠️  DRAFT MODE
   While DRAFT_MODE is true, every sample price and sample review
   is visibly marked on the page so nothing fake can go live by
   accident. Once you've replaced them with your real numbers and
   real client words, set DRAFT_MODE to false.
   ============================================================ */

export const DRAFT_MODE = true;

/* ---------- Business details (pulled from the Instagram bio) ---------- */
export const business = {
  name: "The Hair Rookie",
  handle: "_thehairrookiee",
  instagram: "https://www.instagram.com/_thehairrookiee",
  tagline: "Ponytails, quick weaves & protective styles",
  location: "Downtown Atlanta, GA",
  // Bio says "April books open" — update this line whenever books open/close.
  bookingStatus: "April books are open",
  // CONFIRMED from the Instagram bio. Do not change unless your policy changes.
  depositAmount: 10,
  // Add these when you're ready to share them publicly:
  phone: "",   // e.g. "(404) 555-0123" — leave "" to hide the call button
  email: "",   // e.g. "book@thehairrookie.com" — leave "" to hide the email button
  // CONFIRMED — her real Acuity booking page. Note: as of this build it shows
  // "Online scheduling is not currently available." Once she switches it back
  // on, the Book button on this site works end to end with no changes needed.
  bookingUrl: "https://thehairrookiee.as.me/schedule/5ec63b4f",
  // Set true while Acuity scheduling is switched off — the site then points
  // people to Instagram DMs instead of a dead booking link.
  bookingOffline: true
};

/* ---------- Services & prices ----------
   ⚠️  Instagram lists NO prices, so every number below is a SAMPLE
   based on typical downtown-Atlanta rates. Replace each one.

   price      → starting price in dollars, or null to show "Inquire"
   duration   → rough time, or "" to hide
   sample     → true means "this is a placeholder". Set to false once
                you've put in your real price.
------------------------------------------------------------ */
export const services = [
  {
    name: "Sleek Ponytail",
    blurb: "High, mid or low. Laid edges, sleek finish, wrapped base.",
    price: 85,
    duration: "1 hr 30 min",
    sample: true,
    popular: true
  },
  {
    name: "Mid / Low Ponytail",
    blurb: "The signature look — soft drape with basic baby hairs.",
    price: 85,
    duration: "1 hr 30 min",
    sample: true
  },
  {
    name: "Quick Weave",
    blurb: "Full quick weave install, cut and styled to finish. Hair not included.",
    price: 120,
    duration: "2 hrs",
    sample: true,
    popular: true
  },
  {
    name: "Quick Weave with Leave-Out",
    blurb: "Natural leave-out blended into the install.",
    price: 135,
    duration: "2 hrs 15 min",
    sample: true
  },
  {
    name: "Bantu Knots",
    blurb: "Sculpted knots, clean parts, edges laid.",
    price: 75,
    duration: "1 hr 30 min",
    sample: true
  },
  {
    name: "Braid Down / Install Prep",
    blurb: "Foundation braid-down for a ponytail or weave install.",
    price: 40,
    duration: "45 min",
    sample: true
  },
  {
    name: "Wig Install",
    blurb: "Glueless or glued install, customized and styled. Hair not included.",
    price: 130,
    duration: "2 hrs",
    sample: true
  },
  {
    name: "Take-Down & Wash",
    blurb: "Full take-down, detangle, cleanse and condition.",
    price: 45,
    duration: "1 hr",
    sample: true
  }
];

/* ---------- Booking policy ---------- */
export const policies = [
  // CONFIRMED from the Instagram bio.
  "A $10 deposit is required to book. It goes toward your service total.",
  // CONFIRMED from the banner on her Acuity booking page.
  "Hair is not included — please bring your own bundles or wig.",
  // The rest are common stylist policies — edit or delete any that aren't yours.
  "Please come with hair washed, blow-dried and detangled unless your service includes it.",
  "15-minute grace period. After that the appointment may be released.",
  "Reschedules need 24 hours' notice to keep your deposit."
];

/* ---------- Gallery ----------
   Instagram blocks direct downloads, so the photos aren't here yet.

   TO ADD YOUR PHOTOS:
   1. Open each post on Instagram, save the image.
   2. Drop the files into  hair-site/assets/gallery/
   3. Put the file name in "image" below.

   Until a file exists, the card gracefully shows the caption and a
   link straight to the post — the site never shows a broken image.
   These 8 permalinks are the real posts from the account.
------------------------------------------------------------ */
export const gallery = [
  { image: "assets/gallery/01.jpg", caption: "Ponytail install",           permalink: "https://www.instagram.com/_thehairrookiee/reel/Dbt6zN9JzD5/" },
  { image: "assets/gallery/02.jpg", caption: "Fresh set",                  permalink: "https://www.instagram.com/_thehairrookiee/p/Dbt6IfoCVoG/" },
  { image: "assets/gallery/03.jpg", caption: "Bantu knots",                permalink: "https://www.instagram.com/_thehairrookiee/p/DXCq8DhDR1n/" },
  { image: "assets/gallery/04.jpg", caption: "Style reel",                 permalink: "https://www.instagram.com/_thehairrookiee/reel/DXBBVhUjf1L/" },
  { image: "assets/gallery/05.jpg", caption: "Mid low ponytail",           permalink: "https://www.instagram.com/_thehairrookiee/reel/DWr_kokCU-W/" },
  { image: "assets/gallery/06.jpg", caption: "Sleek finish",               permalink: "https://www.instagram.com/_thehairrookiee/reel/DWmJdiqkX2w/" },
  { image: "assets/gallery/07.jpg", caption: "Behind the chair",           permalink: "https://www.instagram.com/_thehairrookiee/reel/DVjmcSvidyG/" },
  { image: "assets/gallery/08.jpg", caption: "Client result",              permalink: "https://www.instagram.com/_thehairrookiee/p/DVZisBJCSy5/" }
];

/* ---------- Reviews ----------
   ⚠️  The Instagram comments are emoji only ("😍😍😍"), so there are no
   real written reviews to pull. Everything below is a SAMPLE and is
   visibly stamped as such on the page.

   Replace "quote" and "author" with real client words, then set
   sample: false on that review. Delete any you don't use.
------------------------------------------------------------ */
export const reviews = [
  { quote: "Replace this with something a real client actually said about their ponytail.", author: "Client name", stars: 5, sample: true },
  { quote: "Replace this with a real review about a quick weave install.",                   author: "Client name", stars: 5, sample: true },
  { quote: "Replace this with a real review about the overall experience.",                  author: "Client name", stars: 5, sample: true }
];

/* ---------- FAQ ---------- */
export const faq = [
  { q: "How do I book?",            a: "Send a DM on Instagram with the style you want and the day that works for you. A $10 deposit locks the slot in." },
  { q: "Where are you located?",    a: "Downtown Atlanta. The exact address is sent once your deposit is in." },
  { q: "Do you provide the hair?",  a: "Hair is not included — bring your own bundles or wig. Happy to advise on what to buy before your appointment." },
  { q: "How long does it take?",    a: "Ponytails run about an hour and a half; quick weaves closer to two hours. Time estimates are listed with each service." },
  { q: "What if I need to move my appointment?", a: "Just give 24 hours' notice and your deposit carries over to the new date." }
];
