// Regenerate the fixture posters used by the visual (golden-image) suite.
//
//   node scripts/generate-test-fixtures.mjs
//
// Solid-colour 2:3 images, generated rather than scraped: renders stay
// deterministic and offline, and no real poster art enters the repo. 460x690
// matches POSTER_TARGET_W/H in src/shared/posters.ts, so fixtures arrive at the
// same size a real poster fetch would deliver.
//
// Re-running this rewrites the JPEGs byte-for-byte identically, so it will not
// spuriously move a golden.
import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'node:fs'

const OUT = 'test/fixtures/posters'

const COLORS = [
  ['a', '#c0392b'], ['b', '#2980b9'], ['c', '#27ae60'], ['d', '#8e44ad'],
  ['e', '#d35400'], ['f', '#16a085'], ['g', '#2c3e50'], ['h', '#f39c12'],
  ['i', '#7f8c8d'], ['j', '#c0392b'], ['k', '#2c3e50'], ['l', '#27ae60'],
  ['m', '#8e44ad'], ['n', '#d35400'], ['o', '#2980b9'], ['p', '#16a085'],
  ['q', '#f39c12'], ['r', '#7f8c8d'], ['s', '#c0392b'], ['t', '#2980b9'],
]

mkdirSync(OUT, { recursive: true })

for (const [name, hex] of COLORS) {
  const c = createCanvas(460, 690)
  const ctx = c.getContext('2d')
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, 460, 690)
  // A light band near the bottom: if a poster is ever drawn stretched, flipped,
  // or with the wrong aspect, the band moves and the diff makes it obvious.
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  ctx.fillRect(0, 552, 460, 46)
  // White, not the fill colour: the letter identifies which fixture landed
  // where, so it has to be legible against the poster.
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = 'bold 160px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(name.toUpperCase(), 230, 300)
  writeFileSync(`${OUT}/poster-${name}.jpg`, c.toBuffer('image/jpeg', { quality: 0.9 }))
}

console.log(`generated ${COLORS.length} fixture posters in ${OUT}/`)
