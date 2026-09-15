CLIENT PHOTOS — the portfolio gallery
=====================================

Five photos of Queenie's work go here. They appear near the top of the
site, right under the hero and above the prices, as a polaroid wall under
the heading "Reviews from our customers".

Save them here with these exact names:

  01.jpg   Honey blonde lace install
  02.jpg   Curly half-up ponytail
  03.jpg   Sleek straight ponytail
  04.jpg   Body wave install
  05.jpg   Blunt cut bob

.jpg, .jpeg, .png and .webp all work — if you use a different extension,
update the matching "image" value in ../../data.js.

Then rebuild so the photos get baked into the published page:

    node build.mjs

The build prints how many photos it embedded and lists any still missing.
A missing photo just shows a placeholder frame — the site never displays
a broken image.

Captions live in the "clientPhotos" list in ../../data.js. Add or remove
entries there and the wall grows or shrinks to match.

Tip: portrait photos look best. The frames crop to 3:4.
