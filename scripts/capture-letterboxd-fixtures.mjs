#!/usr/bin/env node
/**
 * Capture trimmed Letterboxd HTML fixtures for the scraper tests.
 *
 * WHY THESE EXIST. Both scrapers were tested entirely against inline template
 * literals — markup a developer wrote down from memory. In September 2026 that
 * belief was six months stale: Letterboxd had removed data-poster-url, every
 * card on boxd-card.com failed for ten days, and all 484 tests stayed green the
 * whole time. A hand-written fixture can only ever encode what we already
 * believe. These files encode what Letterboxd actually served.
 *
 * Usage:  node scripts/capture-letterboxd-fixtures.mjs [--user <handle>]
 *
 * Fetches through the PRODUCTION PROXY, which is the exact transport the web app
 * uses — so a fixture that parses here is evidence about production, not about
 * curl. Trims each page to the containers the scrapers touch (whole pages are
 * 160-350 KB each) and stamps the source URL and capture date into the file.
 *
 * Only ever capture the repo owner's own profile. These are real member pages;
 * committing a stranger's viewing history is not ours to do.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROXY = process.env.VITE_PROXY_URL ?? 'https://api.boxd-card.com'
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'letterboxd')

const userArg = process.argv.indexOf('--user')
const USER = userArg > -1 ? process.argv[userArg + 1] : 'michaellamb'

/** Keep at most this many sibling entries per container — enough for a 20-item card. */
const MAX_ENTRIES = 22

const TARGETS = [
  { name: 'profile',       url: `https://letterboxd.com/${USER}/`,        keep: ['section#recent-activity', 'section#favourites', '.profile-summary'] },
  { name: 'films',         url: `https://letterboxd.com/${USER}/films/`,  keep: ['ul.grid'] },
  { name: 'diary',         url: `https://letterboxd.com/${USER}/diary/`,  keep: ['table#diary-table'] },
  { name: 'reviews-list',  url: `https://letterboxd.com/${USER}/reviews/`, keep: ['div.viewing-list'] },
  { name: 'review-single', url: `https://letterboxd.com/${USER}/film/akira/`, keep: ['section.viewing-poster-container', '.inline-production-masthead', '.content-reactions-strip', 'p.view-date', '.js-review-body', 'ul.tags'] },
  { name: 'list',          url: `https://letterboxd.com/${USER}/list/my-2026-releases-ranked/`, keep: ['.list-title-intro', 'ul.poster-list'] },
  // The film page is the JSON-LD source resolvePosterCdnUrl() reads.
  { name: 'film-page',     url: 'https://letterboxd.com/film/high-and-low/', keep: ['script[type="application/ld+json"]'] },
]

/** Drop all but the first MAX_ENTRIES children of a list-ish container. */
function truncateChildren(el) {
  const kids = Array.from(el.children)
  if (kids.length <= MAX_ENTRIES) return
  kids.slice(MAX_ENTRIES).forEach(k => k.remove())
}

async function capture({ name, url, keep }) {
  const res = await fetch(`${PROXY}/?url=${encodeURIComponent(url)}`)
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} for ${url}`)
  const { window } = new JSDOM(await res.text())
  const doc = window.document

  const parts = []
  for (const sel of keep) {
    for (const el of doc.querySelectorAll(sel)) {
      // Diary/grid bodies nest one level deeper than the container we keep.
      for (const inner of [el, ...el.querySelectorAll('tbody, ul.grid, ul.poster-list')]) {
        truncateChildren(inner)
      }
      parts.push(el.outerHTML)
    }
  }
  if (!parts.length) throw new Error(`${name}: none of ${keep.join(', ')} matched — the markup moved again`)

  const owner = doc.body.dataset.owner ?? USER
  const html = `<!--
  Captured ${new Date().toISOString().slice(0, 10)} from ${url}
  via the production proxy (${PROXY}).
  Trimmed to: ${keep.join(', ')}
  Regenerate with: node scripts/capture-letterboxd-fixtures.mjs
-->
<!DOCTYPE html>
<html><body data-owner="${owner}">
${parts.join('\n')}
</body></html>
`
  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(path.join(OUT_DIR, `${name}.html`), html)
  console.log(`  ${name.padEnd(14)} ${String(html.length).padStart(7)} bytes  <- ${url}`)
}

console.log(`Capturing Letterboxd fixtures for @${USER} through ${PROXY}`)
for (const t of TARGETS) {
  await capture(t)
}
console.log('done')
