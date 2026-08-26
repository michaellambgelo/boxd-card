// Turn a visual-suite run into a GitHub job summary.
//
// The golden-portability job exists to measure how far Linux rasterization
// drifts from the macOS-baked goldens. That number is the deliverable, so it
// belongs somewhere readable — not encoded as a red X that says only "differs"
// while telling you nothing about the size of the difference.
import { readFileSync } from 'node:fs'

// Strip ANSI so vitest output parses regardless of colour support.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')
const log = readFileSync(process.argv[2], 'utf8').replace(ANSI, '')

// `pins` text itself contains parentheses — "(single centered row)",
// "(dynamic height)" — so the capture must run to the closing ").' at end of
// line, not to the first ')'. Getting this wrong silently drops exactly the
// goldens whose descriptions are most specific, which skews the peak and can
// invert the recommendation below.
const re = /Golden "([^"]+)" moved \(pins: (.*)\)\.[^\n]*\n\s*(?:(\d+) of (\d+) pixels differ \(([\d.]+)%\)|(dimensions changed[^\n]*))/g

// vitest prints each failure twice — inline, then again in the Failed Tests
// summary — so dedupe by golden name.
const byName = new Map()
for (const m of log.matchAll(re)) {
  if (byName.has(m[1])) continue
  byName.set(m[1], {
    name: m[1],
    pins: m[2],
    pct: m[5] ? Number(m[5]) : null,
    dims: m[6] ?? null,
  })
}
const rows = [...byName.values()]

const sawFailures = /\d+ failed/.test(log)

const out = ['## Golden portability — macOS baked vs Linux rendered', '']

if (!rows.length && sawFailures) {
  // Never let an unparsed run read as a clean one — that would argue for
  // dropping the gate on no evidence at all.
  out.push(
    '**Inconclusive.** The suite reported failures but no golden comparisons could be',
    'parsed, so this run measured nothing. Check the raw log: the run probably died',
    'before reaching the comparisons, or the assertion format changed and this parser',
    'needs updating. **Do not read this as agreement between the platforms.**',
  )
} else if (!rows.length) {
  out.push(
    '**All goldens matched on Linux.** No pixel differences.',
    '',
    'If this holds consistently, `SKIP_IN_CI` in `test/visual/goldens.visual.test.ts`',
    'can be dropped and this job promoted into a real gate.',
  )
} else {
  const pcts = rows.filter((r) => r.pct !== null).map((r) => r.pct)
  const max = pcts.length ? Math.max(...pcts) : null
  const anyDims = rows.some((r) => r.dims)

  out.push(
    `${rows.length} golden(s) differ. **Dimensions ${anyDims ? 'CHANGED — layout is diverging' : 'preserved — layout is identical'}.**`,
    '',
    '| Golden | Pixels differing | Pins |',
    '|---|---:|---|',
    ...rows
      .slice()
      .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101))
      .map((r) => `| \`${r.name}\` | ${r.dims ? `**${r.dims}**` : `${r.pct.toFixed(3)}%`} | ${r.pins} |`),
    '',
  )

  if (max !== null) {
    // 2.472% is the measured movement from a deliberate 2px posterGap change —
    // the smallest real regression this suite was built to catch.
    const REFERENCE = 2.472
    out.push(
      `Peak platform noise: **${max.toFixed(3)}%**.`,
      `A deliberate 2px \`posterGap\` change moves a golden by **${REFERENCE}%**.`,
      '',
      max >= REFERENCE * 0.5
        ? 'Noise is within a factor of two of a real regression, so the CI skip stays: any tolerance wide enough to absorb the platform difference would start swallowing genuine single-pixel layout changes.'
        : 'Noise is now well below a real regression. Worth reconsidering whether the goldens can gate on Linux directly.',
    )
  }
}

out.push('', '_This job measures; it never gates. A difference here is data, not a broken PR._')
console.log(out.join('\n'))
