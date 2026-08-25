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
// ANSWERED, on ubuntu-24.04 (PR #68, golden-portability job):
//
//   The environment itself is fine on Linux — node-canvas builds, Inter
//   registers, and every other visual test passes. Layout is portable too: all
//   11 goldens kept their EXACT dimensions, so embedding Inter really did fix
//   the metric-level divergence that generic `sans-serif` caused. Text wraps
//   identically on both platforms.
//
//   What still differs is glyph-edge antialiasing — freetype hints differently
//   from CoreText. Measured spread: 0.556% to 1.874% of pixels.
//
//   That range is why the gate stays. A deliberate 2px change to the grid
//   posterGap moves grid-4-films by 2.472%. Raising the tolerance enough to
//   absorb 1.874% of platform noise would leave almost no margin before it
//   started swallowing real single-pixel layout regressions — which is the only
//   thing these goldens exist to catch.
//
//   Revisit if the diff narrows (a pinned freetype, or baking goldens in a
//   container that matches CI). The golden-portability job keeps measuring it on
//   every PR, so the number is always current.
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
