import { defineConfig } from 'vitest/config'

// Two projects, because the golden-image suite needs a real canvas and every
// other test in the repo was written against a mocked one.
//
//   unit   — the 473 pre-existing tests. Loads the canvas mock, unchanged.
//   visual — *.visual.test.ts only. Loads NO canvas mock, so jsdom's own
//            node-canvas-backed 2D context is left intact and renderCard()
//            produces real pixels.
//
// Splitting the projects is deliberate rather than saving and restoring the
// original getContext: Object.defineProperty on the prototype destroys the
// reference, so a restore would mean stashing it on globalThis from inside the
// setup file. Two projects is boring and legible; that is the point.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./test/setup.chrome.ts', './test/setup.canvasMock.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/*.visual.test.ts', '**/*.gen.test.ts'],
        },
      },
      {
        // Generators: the studio and anything else that writes files. Excluded
        // from `npm run test:run` on purpose, so CI never writes and a normal
        // test run never rewrites studio output.
        test: {
          name: 'generate',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./test/setup.chrome.ts', './test/canvasEnv.ts'],
          include: ['**/*.gen.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**'],
        },
      },
      {
        test: {
          name: 'visual',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./test/setup.chrome.ts', './test/canvasEnv.ts'],
          include: ['**/*.visual.test.ts'],
          exclude: ['**/node_modules/**', '**/dist/**', '**/*.gen.test.ts'],
        },
      },
    ],
  },
})
