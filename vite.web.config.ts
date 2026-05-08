import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import faroUploader from '@grafana/faro-rollup-plugin'
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
 *   VITE_FARO_PROXY_URL=https://grafana.michaellamb.dev   ← Grafana Faro proxy base
 *   VITE_APP_VERSION=<package.json version>               ← optional override
 *   GRAFANA_FARO_API_KEY=<faro cloud api key>             ← enables source-map upload on prod build
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')

  // Source-map upload runs only on production builds and only when the API
  // key is present. Local builds without the key still succeed; Faro stack
  // traces just remain unmapped.
  const enableFaroUpload = mode === 'production' && Boolean(env.GRAFANA_FARO_API_KEY)

  return {
    plugins: [
      react(),
      ...(enableFaroUpload
        ? [
            faroUploader({
              appName: 'boxd-card',
              endpoint: 'https://faro-api-prod-us-east-0.grafana.net/faro/api/v1',
              appId: env.GRAFANA_FARO_APP_ID || 'TODO_BOXD_CARD_APP_ID',
              stackId: '997632',
              apiKey: env.GRAFANA_FARO_API_KEY,
              gzipContents: true,
              verbose: false,
            }),
          ]
        : []),
    ],

    root: resolve(__dirname, 'src/web'),
    envDir: __dirname,
    base: '/app/',

    build: {
      outDir: resolve(__dirname, 'docs/app'),
      emptyOutDir: true,
      // Emit source maps so the Faro upload plugin can read them. The .map
      // files ship to GitHub Pages alongside the bundle, which is fine for
      // an open-source app.
      sourcemap: true,
    },

    server: {
      port: 5174,
    },
  }
})
