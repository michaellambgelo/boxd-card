import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { GOLDENS } from './goldens'
import { comparePng } from './imageDiff'
import { renderToBuffer } from './harness'

const GOLDEN_DIR = 'test/goldens'
const FAILURE_DIR = 'studio-out/golden-failures'
const UPDATE = process.env.UPDATE_GOLDENS === '1'

// ── Why this suite skips in CI ───────────────────────────────────────────────
//
// .github/workflows/pr-checks.yml runs on ubuntu-latest. Goldens are baked on
// macOS. Even with Inter embedded and registered — which removed the original
// reason, a generic `sans-serif` resolving through fontconfig rather than
// CoreText — freetype version differences between the two platforms can still
// shift hinting and antialiasing enough to move every pixel comparison.
//
// Whether that actually happens here is an empirical question, and the draft PR
// answers it: this constant is the one thing to flip once ubuntu-latest has been
// observed agreeing with macOS.
//
// DO NOT "fix" a red CI by deleting or re-baking the goldens. If they move, they
// are telling you something. Re-bake only when a rendering change was intended,
// and only with `npm run goldens:update` after looking at the diff images.
//
// RUN_VISUAL_IN_CI=1 forces them to run anyway. The golden-portability job in
// pr-checks.yml sets it and is continue-on-error, so the question gets asked on
// every PR without its answer gating the build. Without that escape hatch the
// skip would be self-sealing: the experiment could never run, so the gate could
// never be justifiably removed.
const SKIP_IN_CI = !!process.env.CI && process.env.RUN_VISUAL_IN_CI !== '1'

describe.skipIf(SKIP_IN_CI)('golden images', () => {
  it.each(GOLDENS.map((g) => [g.name, g] as const))('%s', async (name, golden) => {
    const path = `${GOLDEN_DIR}/${name}.png`
    const actual = await renderToBuffer(golden.options)

    if (UPDATE || !existsSync(path)) {
      mkdirSync(GOLDEN_DIR, { recursive: true })
      writeFileSync(path, actual)
      // A freshly written golden proves nothing; say so rather than passing green.
      if (!UPDATE) {
        throw new Error(
          `No golden existed for "${name}" — one has been written to ${path}. ` +
          'Inspect it, then re-run. This is deliberately a failure: a golden that ' +
          'was created by the same run that "verified" it has verified nothing.',
        )
      }
      return
    }

    const expected = readFileSync(path)
    const result = comparePng(actual, expected)

    if (!result.equal) {
      mkdirSync(FAILURE_DIR, { recursive: true })
      writeFileSync(`${FAILURE_DIR}/${name}.actual.png`, actual)
      if (result.diffPng) writeFileSync(`${FAILURE_DIR}/${name}.diff.png`, result.diffPng)
    }

    expect(
      result.equal,
      `Golden "${name}" moved (pins: ${golden.pins}).\n` +
      `  ${result.reason}\n` +
      `  actual: ${FAILURE_DIR}/${name}.actual.png\n` +
      `  diff:   ${FAILURE_DIR}/${name}.diff.png\n` +
      '  If this change was intended, re-bake with: npm run goldens:update',
    ).toBe(true)
  }, 60_000)
})
