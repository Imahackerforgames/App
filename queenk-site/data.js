/* ============================================================
   QUEEN K BEAUTY ETC — site content
   ------------------------------------------------------------
   This is the ONLY file you need to edit. No build step.
   Edit it, save, refresh the page.

   Almost everything here is REAL — taken from Queenie's own
   booking flyers and her live Acuity booking page. Anything
   still standing in is marked  sample: true  and is stamped
   on the page while DRAFT_MODE is true, so nothing invented
   can go live by accident.
   ============================================================ */

export const DRAFT_MODE = true;

/* ---------- Business — ALL CONFIRMED from her flyers ---------- */
export const business = {
  name: "Queen K",
  fullName: "Queen K Beauty Etc",
  owner: "Queenie K Deloach",
  tagline: "Hello Gorgeous",
  welcome:
    "Thank you for visiting! Book your appointment and read the rules. " +
    "If you're interested in booking with me, please follow the instructions on the " +
    "booking page, and kindly read through the rules and regulations so we both have " +
    "a smooth and enjoyable experience.",

  phone:     "(912) 468-4033",
  email:     "queenkbeautyetc@gmail.com",
  instagram: "https://www.instagram.com/queen_kreationss",
  igHandle:  "@queen_kreationss",
  facebook:  "Queenie K Deloach",
  location:  "Savannah, GA — Southside area",

  bookingUrl: "https://queenkbeautyetc.as.me/schedule/e8feb61a",
  timezone:   "Eastern Time (GMT-04:00)",
  deposit:    25          // $25 deposit due upon booking
};

/* ---------- Hours & fees — CONFIRMED from the flyer ---------- */
export const hours = {
  standard:  { days: "Monday – Saturday", time: "9:30 AM – 5:30 PM" },
  /* Surcharges, shown live on the time slots below. */
  fees: [
    { label: "Sunday",           amount: 45, note: "Sunday booking fee" },
    { label: "After 5:30 PM",    amount: 30, note: "Evening fee" },
    { label: "After 7:00 PM",    amount: 40, note: "Late evening fee" },
    { label: "Same-day booking", amount: null, note: "Available — fees may apply" }
  ]
};

/* ---------- The booking calendar ----------
   The site shows a live calendar and PM time slots so a client can
   pick service + day + time in a few taps. The final confirmation
   still happens on her real Acuity page, which is where the deposit
   is taken — this just gets them there already decided.
------------------------------------------------------------ */
export const scheduling = {
  slotMinutes: 15,        // gap between time slots
  dayStart:    "12:30",   // first PM slot shown
  dayEnd:      "17:30",   // end of standard hours (5:30 PM)
  eveningEnd:  "21:00",   // latest bookable slot, with a fee
  monthsAhead: 2,         // how many months the calendar can page through
  sundayOpen:  true       // her flyer offers Sunday with a $45 fee
};

/* ---------- Services ----------
   The 9 categories are CONFIRMED — exactly the categories on her live
   booking page. Prices marked sample: true still need her real numbers;
   the ones without that flag came straight from her booking page.

   price → dollars, or null to show "Inquire"
------------------------------------------------------------ */
export const categories = [
  {
    name: "Coloring Service",
    blurb: "Full colour, highlights and toning — on your hair or your bundles.",
    featured: true,
    services: [
      // CONFIRMED — read directly from her booking page.
      { name: "Entire Head of Color", price: 70, duration: "1 hr 50 min" },
      { name: "Highlights",           price: null, sample: true },
      { name: "Bundle / Wig Coloring", price: null, sample: true }
    ]
  },
  {
    name: "Quick Weaves",
    blurb: "Fast, full installs cut and styled to finish the same visit.",
    featured: true,
    services: [
      { name: "Full Quick Weave",         price: 120, sample: true },
      { name: "Quick Weave w/ Leave-Out", price: 135, sample: true },
      { name: "Bob Quick Weave",          price: 110, sample: true }
    ]
  },
  {
    name: "Sew Ins",
    blurb: "Long-wearing sewn installs built on a clean braid foundation.",
    featured: true,
    services: [
      { name: "Full Sew In",    price: 180, sample: true },
      { name: "Partial Sew In", price: 150, sample: true },
      { name: "Closure Sew In", price: 200, sample: true }
    ]
  },
  {
    name: "Ponytails",
    blurb: "Sleek, high or dramatic drop ponytails with a clean wrapped base.",
    services: [
      { name: "Sleek Ponytail",  price: 85, sample: true },
      { name: "High Ponytail",   price: 85, sample: true },
      { name: "Drop Ponytail",   price: 95, sample: true }
    ]
  },
  {
    name: "Wig Installs",
    blurb: "Glued or glueless installs, customized, bleached and styled.",
    services: [
      { name: "Glueless Install",  price: 130, sample: true },
      { name: "Glued Install",     price: 140, sample: true },
      { name: "Install w/ Custom", price: 165, sample: true }
    ]
  },
  {
    name: "LACE",
    blurb: "Lace customization — plucking, bleaching and a melted hairline.",
    services: [
      { name: "Lace Customization", price: 95, sample: true },
      { name: "Frontal Prep",       price: 85, sample: true },
      { name: "Closure Prep",       price: 70, sample: true }
    ]
  },
  {
    name: "Dreads",
    blurb: "Starter locs, retwists and loc maintenance.",
    services: [
      { name: "Starter Locs",      price: 90, sample: true },
      { name: "Retwist",           price: 75, sample: true },
      { name: "Retwist w/ Style",  price: 95, sample: true }
    ]
  },
  {
    name: "Natural Hair",
    blurb: "Silk presses, twist-outs and healthy natural styling.",
    services: [
      { name: "Silk Press",    price: 75, sample: true },
      { name: "Wash & Style",  price: 55, sample: true },
      { name: "Twist-Out",     price: 65, sample: true }
    ]
  },
  {
    name: "Touch Ups",
    blurb: "Quick refreshes between full appointments.",
    services: [
      { name: "Edge / Perimeter Touch Up", price: 45, sample: true },
      { name: "Re-Style",                  price: 50, sample: true }
    ]
  }
];

/* ---------- Add-ons — EVERY ONE CONFIRMED ----------
   These came straight off her booking page, prices and times exact.
------------------------------------------------------------ */
export const addOns = [
  { name: "Added Curls",                     price: 30, duration: "+30 min" },
  { name: "Barrel Curls",                    price: 30, duration: "+35 min" },
  { name: "Bleach Bundles",                  price: 30, duration: "+35 min" },
  { name: "Braid Down w/ Shampoo (no style)", price: 40, duration: "+30 min" },
  { name: "Crimps",                          price: 75, duration: "+1 hr" },
  { name: "Deep Conditioning",               price: 30, duration: "+30 min" },
  { name: "Finger Waves",                    price: 45, duration: "+35 min" },
  { name: "Pin Curls",                       price: 40, duration: "+35 min" },
  { name: "Protein Treatment",               price: 40, duration: "+30 min" },
  { name: "Relaxer",                         price: 80, duration: "+45 min" }
];

/* ---------- Booking policies — ALL CONFIRMED ---------- */
export const bookingPolicies = [
  { icon: "x",     title: "Cancellations", text: "We kindly ask for a minimum of 24 hours' notice for any appointment cancellations." },
  { icon: "money", title: "Payments",      text: "A $25 deposit is due upon booking. Payment is due at the time of service completion. We accept cash, Cash App and Apple Pay." },
  { icon: "users", title: "Guests",        text: "No extra guests are allowed. No exceptions! Please wear a mask if you're feeling under the weather." },
  { icon: "clock", title: "Late Arrivals", text: "To ensure all clients receive their full service, late arrivals must pay $20 after 10 minutes. After 20 minutes the appointment is cancelled." }
];

/* ---------- Salon policies — ALL CONFIRMED ---------- */
export const salonPolicies = [
  { icon: "box",     title: "Drop Offs",   text: "Please drop off your lace 24–48 hours prior to your appointment, or a $10 fee will be applied to your install." },
  { icon: "sparkle", title: "Weave Types", text: "For great quality styles we recommend Remy Blue, Vizzo and Empire for bobs. For short cuts we recommend Tara 2, 4, 6 (purple pack)." },
  { icon: "alert",   title: "Allergies",   text: "Clients with hair allergies: do not get the pack that says \"Pro Allergic to Tara\" in the purple pack. Please get the Velvet Cube box for short cuts." },
  { icon: "drop",    title: "Shampoo",     text: "Arrive with your hair washed and fully detangled. An additional fee applies if you did not request a shampoo while booking." }
];

/* ---------- Pre-appointment checklist — CONFIRMED ---------- */
export const checklist = [
  "Confirm your appointment",
  "Wear face mask",
  "Wash & detangle hair",
  "Communicate any concerns",
  "Arrive on time",
  "Relax and get slayed"
];

/* ---------- Client photos ("vouch proof") ----------
   These are the four customer photos from her review flyer. They came
   through as a screenshot, so the individual image files could not be
   saved automatically.

   TO ADD THEM:
   1. Save each of the four review photos.
   2. Drop them into  queenk-site/assets/reviews/  as 01.jpg … 04.jpg
   Each frame falls back to a styled placeholder until its file exists,
   so the page never shows a broken image.
------------------------------------------------------------ */
export const clientPhotos = [
  { image: "assets/reviews/01.jpg", caption: "Short cut & style" },
  { image: "assets/reviews/02.jpg", caption: "Quick weave bob" },
  { image: "assets/reviews/03.jpg", caption: "Layered pixie" },
  { image: "assets/reviews/04.jpg", caption: "Colour & cut" }
];

/* ---------- Written reviews ----------
   ⚠️  Her flyer shows photos but no written quotes, so these are
   placeholders. Replace the text, then set sample: false on each.
------------------------------------------------------------ */
export const reviews = [
  { quote: "Replace this with something a real client said about their cut or colour.", author: "Client name", stars: 5, service: "Coloring Service", sample: true },
  { quote: "Replace this with a real review about a quick weave or sew in.",            author: "Client name", stars: 5, service: "Quick Weaves",     sample: true },
  { quote: "Replace this with a real review about the overall experience.",             author: "Client name", stars: 5, service: "Sew Ins",          sample: true }
];

/* ---------- FAQ — answers drawn from her real policies ---------- */
export const faq = [
  { q: "How do I book?", a: "Pick your style, day and time here, then tap through to the booking page to confirm. A $25 deposit is due upon booking." },
  { q: "Where are you located?", a: "Savannah, GA — Southside area. The exact address is shared once your appointment is confirmed." },
  { q: "How should I arrive?", a: "With your hair washed and fully detangled. If you didn't request a shampoo while booking, an additional fee applies." },
  { q: "What if I'm running late?", a: "Late arrivals must pay $20 after 10 minutes. After 20 minutes the appointment is cancelled, so please message as early as you can." },
  { q: "Can I bring someone with me?", a: "No extra guests are allowed — no exceptions. Please wear a mask if you're feeling under the weather." },
  { q: "What hair should I buy?", a: "For great quality styles: Remy Blue, Vizzo and Empire for bobs. For short cuts, Tara 2, 4, 6 (purple pack) — unless you have hair allergies, in which case use the Velvet Cube box." },
  { q: "When do I drop off my lace?", a: "24–48 hours before your appointment. Otherwise a $10 fee is applied to your install." },
  { q: "Do you take evening or Sunday appointments?", a: "Yes. There's a $30 fee after 5:30 PM, $40 after 7:00 PM, and a $45 fee on Sundays. Same-day booking is available." }
];
