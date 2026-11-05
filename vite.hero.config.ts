import { defineConfig } from 'vite'
import { resolve } from 'path'

/**
 * Builds the /about hero script: the real card renderer plus a fixed sample
 * film set (src/hero/), so the About page shows genuine renders instead of an
 * HTML imitation of a card.
 *
 * Build:  npm run build:hero   → docs/about/hero.js, hero.css, hero-assets/
 *
 * Fixed entry and stylesheet names, because docs/about/index.html is
 * hand-written and links them directly; fonts and the logo keep content hashes.
 * The pre-commit hook rebuilds this whenever the renderer or its inputs are
 * staged, so the hero cannot fall behind the product.
 */
export default defineConfig({
  root: resolve(__dirname, 'src/hero'),
  envDir: __dirname,
  base: '/about/',
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'docs/about'),
    // docs/about/index.html is hand-written and lives in this directory.
    emptyOutDir: false,
    // Keep the fonts as files rather than inlining ~200 KB of base64 into JS.
    assetsInlineLimit: 0,
    rollupOptions: {
      input: resolve(__dirname, 'src/hero/hero.ts'),
      output: {
        entryFileNames: 'hero.js',
        chunkFileNames: 'hero-assets/[name]-[hash].js',
        assetFileNames: (info) =>
          info.names?.some((n) => n.endsWith('.css'))
            ? 'hero.css'
            : 'hero-assets/[name]-[hash][extname]',
      },
    },
  },
})
