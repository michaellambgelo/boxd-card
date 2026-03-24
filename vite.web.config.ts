import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

/**
 * Vite config for the standalone web app (docs/app/).
 *
 * Build:  npm run build:web
 * Dev:    npm run dev:web   (start the proxy worker first: npx wrangler dev --port 8787)
 *
 * Environment variables (create .env.local in project root):
 *   VITE_PROXY_URL=http://localhost:8787   ← for local dev with wrangler dev
 *   VITE_PROXY_URL=https://proxy.boxd-card.michaellamb.dev  ← for production
 */
export default defineConfig({
  plugins: [react()],

  // Treat src/web/ as the Vite root so index.html is found there.
  // Module imports that traverse up (e.g. ../canvas/renderCard) still resolve
  // correctly because Rollup follows the import graph from each file's own
  // directory rather than from the root.
  root: resolve(__dirname, 'src/web'),

  // Load .env files from the project root (not from src/web/).
  envDir: __dirname,

  // Asset URLs must be relative to /app/ since GitHub Pages serves this
  // from boxd-card.michaellamb.dev/app/, not the domain root.
  base: '/app/',

  build: {
    // Output to docs/app/ so GitHub Pages serves it at /app/
    outDir: resolve(__dirname, 'docs/app'),
    emptyOutDir: true,
  },

  server: {
    // Dev server port distinct from the default (5173) to avoid collision
    // with any other running Vite instance.
    port: 5174,
  },
})
