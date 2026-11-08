// Builds ORVEL into one self-contained HTML file (dist-single/orvel.html):
// all JS and CSS inlined, fonts from Google Fonts. Used for the shareable
// Artifact link, where the page must carry everything itself.
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

execSync('npx vite build', { stdio: 'inherit' })
const dist = 'dist'
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const jsPath = html.match(/<script type="module" crossorigin src="\/([^"]+)"/)[1]
const cssPath = html.match(/<link rel="stylesheet" crossorigin href="\/([^"]+)"/)[1]
const js = readFileSync(join(dist, jsPath), 'utf8').replace(/<\/script/gi, '<\\/script')
const css = readFileSync(join(dist, cssPath), 'utf8')
const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0]

// The host page supplies <!doctype>, <html>, <head>, <body>; we write content only.
const out = `<title>ORVEL</title>
<meta name="theme-color" content="#04130b">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>${css}</style>
<div id="root"></div>
<script type="module">${js}</script>
`
mkdirSync('dist-single', { recursive: true })
writeFileSync('dist-single/orvel.html', out)
console.log(`dist-single/orvel.html  ${(out.length / 1024).toFixed(0)} KB`)
