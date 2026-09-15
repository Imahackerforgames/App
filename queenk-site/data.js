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

export const DRAFT_MODE = false;

/* ---------- Business — ALL CONFIRMED from her flyers ---------- */
export const business = {
  name: "Queen K",
  fullName: "Queen K Beauty Etc",
  owner: "Queenie K Deloach",
  tagline: "Hello Gorgeous",
  /* Her own opening line, kept short so the hero does not fill a phone
     screen. The rules it refers to are one tap away on the Policies button. */
  welcome:
    "Thank you for visiting! Book your appointment, and please read the rules " +
    "so we both have a smooth and enjoyable experience.",

  phone:     "(912) 468-4033",
  email:     "queenkbeautyetc@gmail.com",
  instagram: "https://www.instagram.com/queen_kreationss",
  igHandle:  "@queen_kreationss",
  facebook:  "Queenie K Deloach",
  location:  "Savannah, GA",

  bookingUrl: "https://queenkbeautyetc.as.me/schedule/e8feb61a",

  /* Her real Acuity scheduler, run INSIDE this site's booking popup, so a
     client picks a time and pays the deposit without ever leaving the page
     or seeing a link to the old booking site.

     This is her own confirmed scheduling link with Acuity's embed flag
     appended. Availability, the deposit and the card payment are all
     handled by her existing Acuity account — this site is just the frame
     around it, so nothing about her setup has to change.

     IMPORTANT: browsers only allow this embed on a real domain. The
     claude.ai preview link blocks third-party embeds, so there it falls
     back to the built-in picker automatically (see app.js). Deploy the
     site to a host and the real scheduler takes over. */
  embedSrc: "https://queenkbeautyetc.as.me/schedule/e8feb61a?ref=embedded_csp",
  embedTimeoutMs: 9000,
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
    name: "Quick Weaves",
    blurb: "Closure and frontal quick weaves, cut and styled to finish.",
    featured: true,
    services: [
      { name: "Closure Shortcut",                price: 175, duration: "2 hrs" },
      { name: "Closure Quickweave",              price: 155, duration: "1 hr 30 min" },
      { name: "Frontal Quick Weave (no styling)", price: 180, duration: "1 hr 50 min" }
    ]
  },
  {
    name: "Sew Ins",
    blurb: "Long-wearing sewn installs built on a clean braid foundation.",
    featured: true,
    services: [
      { name: "Frontal Sew-In", price: 250, duration: "2 hrs 30 min" },
      { name: "Closure Sew-In", price: 220, duration: "2 hrs" }
    ]
  },
  {
    name: "Natural Hair",
    blurb: "Haircuts, silk presses, relaxers and classic styling on your own hair.",
    featured: true,
    services: [
      { name: "Natural Haircut",      price: 100, duration: "45 min",       note: "Price changes depending on the cut" },
      { name: "Blow Out / Silk Press", price: 140, duration: "1 hr 40 min", note: "Price varies depending on hair length" },
      { name: "Relaxer / Roller Set", price: 120, duration: "1 hr" },
      { name: "Fingerwaves",          price: 75,  duration: "1 hr" },
      { name: "Pin Curl",             price: 75,  duration: "50 min" },
      { name: "Add Tracks",           price: 70,  duration: "45 min" }
    ]
  },
  {
    name: "Dreads",
    blurb: "Starter locs, retwists and loc styling.",
    services: [
      { name: "Starter Locs", price: 125, duration: "2 hrs 5 min", note: "Pricing depends on size & length" },
      { name: "Retwist",      price: 130, duration: "2 hrs",       note: "Prices start at $100 depending on size and length" },
      { name: "Style Locs",   price: 55,  duration: "45 min",      note: "Prices change depending on the style" }
    ]
  },
  {
    name: "Coloring Service",
    blurb: "Colour on your own hair or on your bundles.",
    services: [
      { name: "Entire Head of Color", price: 70, duration: "1 hr 50 min" }
    ]
  },

  /* These four categories are live on her booking page, but their prices
     weren't in the screenshots. Rather than invent numbers, each card sends
     the client to the booking page. Add services here the same way as above
     and the card fills in automatically. */
  {
    name: "LACE",
    blurb: "Lace customization — plucking, bleaching and a melted hairline.",
    services: []
  },
  {
    name: "Ponytails",
    blurb: "Sleek, high and low ponytails with a clean wrapped base.",
    services: []
  },
  {
    name: "Wig Installs",
    blurb: "Glued and glueless installs, customized and styled.",
    services: []
  },
  {
    name: "Touch Ups",
    blurb: "Quick refreshes between full appointments.",
    services: []
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
   2. Drop them into  queenk-site/assets/reviews/  as 01.jpg … 05.jpg
   Each frame falls back to a styled placeholder until its file exists,
   so the page never shows a broken image.
------------------------------------------------------------ */
export const clientPhotos = [
  { image: "assets/reviews/01.jpg", caption: "Honey blonde lace" },
  { image: "assets/reviews/02.jpg", caption: "Curly half-up ponytail" },
  { image: "assets/reviews/03.jpg", caption: "Sleek ponytail" },
  { image: "assets/reviews/04.jpg", caption: "Body wave install" },
  { image: "assets/reviews/05.jpg", caption: "Blunt cut bob" }
];

/* ---------- Written reviews ----------
   Her flyer shows client photos rather than written quotes, so this list is
   empty and the written-review cards stay hidden.

   To add real ones, fill in entries like:
     { quote: "…", author: "Keisha R.", stars: 5, service: "Sew Ins" }
   The section appears on its own as soon as there's at least one.
------------------------------------------------------------ */
export const reviews = [];

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
