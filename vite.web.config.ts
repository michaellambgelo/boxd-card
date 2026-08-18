import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import faroUploader from '@grafana/faro-rollup-plugin'
import { resolve } from 'path'
import { readFileSync } from 'fs'

/**
 * Vite config for the standalone web app (docs/app/).
 *
 * Build:  npm run build:web
 * Dev:    npm run dev:web   (start the proxy worker first: npx wrangler dev --port 8787)
 *
 * Environment variables (create .env.local in project root):
 *   VITE_PROXY_URL=http://localhost:8787   ← for local dev with wrangler dev
 *   VITE_PROXY_URL=https://api.boxd-card.com  ← for production
 *   VITE_FARO_PROXY_URL=https://grafana.michaellamb.dev   ← Grafana Faro proxy base
 *   VITE_APP_VERSION=<version>                            ← optional; defaults to package.json
 *   GRAFANA_FARO_API_KEY=<faro cloud api key>             ← enables source-map upload on prod build
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')

  // Read the version from package.json rather than expecting an env var to be
  // set. It never was, so every production signal shipped as version "0.0.0"
  // and release-over-release comparison in Grafana was impossible. Deriving it
  // here means it can't drift from the released build again.
  const pkgVersion = (
    JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version?: string }
  ).version ?? '0.0.0'
  const appVersion = env.VITE_APP_VERSION || pkgVersion

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
              appId: env.GRAFANA_FARO_APP_ID || '4021',
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

    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },

    build: {
      outDir: resolve(__dirname, 'docs/app'),
      emptyOutDir: true,
      // Emit source maps so the Faro upload plugin can read them at build time
      // and Grafana can un-minify stack traces. The .map files are not
      // committed to docs/app/ and so are not published to Pages — Faro
      // resolves them by the bundle id it injects, not by URL.
      sourcemap: true,
    },

    server: {
      port: 5174,
    },
  }
})
