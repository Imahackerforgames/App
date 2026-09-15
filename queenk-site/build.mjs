/* Bundles the site's four source files into one standalone HTML page.
   data.js stays the single source of truth — re-run this after editing it.

   Usage:  node build.mjs          → writes dist/queen-k.html
*/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), 'utf8');

/* The published page is a single self-contained file, so it can't link to
   image files sitting next to it. Any photo that exists on disk gets baked
   in as a data: URI; any that's missing is left alone, and the page falls
   back to its placeholder frame for that one. */
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
               '.webp': 'image/webp', '.gif': 'image/gif' };

function embedImages(src) {
  let embedded = 0, missing = [];
  const out = src.replace(/image:\s*"(assets\/[^"]+)"/g, (whole, rel) => {
    const abs = join(here, rel);
    if (!existsSync(abs)) { missing.push(rel); return whole; }
    const mime = MIME[extname(rel).toLowerCase()];
    if (!mime) { missing.push(rel); return whole; }
    embedded++;
    return `image: "data:${mime};base64,${readFileSync(abs).toString('base64')}"`;
  });
  return { out, embedded, missing };
}

const css  = read('styles.css');
const html = read('index.html');
const data = read('data.js');
const app  = read('app.js');

/* Body markup, minus the module script tag that pulls in app.js. */
const body = html
  .slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'))
  .replace(/<script type="module"[^>]*><\/script>/g, '')
  .trim();

/* Font <link> tags carry over as-is; Google Fonts is the one allowed host. */
const fontLinks = (html.match(/<link rel="preconnect"[^>]*>|<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g) || []).join('\n');

/* Inline the modules: drop `export` keywords and the import statement, then
   concatenate so app's code sees data's bindings in the same module scope. */
const { out: dataWithImages, embedded, missing } = embedImages(data);
const dataInline = dataWithImages.replace(/^export\s+const\s/gm, 'const ');
const appInline  = app.replace(/^import\s*\{[\s\S]*?\}\s*from\s*'\.\/data\.js';\s*/m, '');

const out = `<title>Queen K Beauty Etc</title>
<meta name="description" content="Quick weaves, sew ins, ponytails, wig installs, locs, natural hair and colour in Savannah, GA. Book your appointment online." />
${fontLinks}
<style>
${css}
</style>
${body}
<script type="module">
${dataInline}
${appInline}
</script>
`;

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'queen-k.html'), out);
console.log(`dist/queen-k.html written — ${(out.length / 1024).toFixed(1)} KB`);
console.log(`photos embedded: ${embedded}`);
if (missing.length) {
  console.log(`photos still missing (placeholder shown for each):`);
  for (const m of missing) console.log(`  - ${m}`);
}
