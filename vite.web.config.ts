import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import faroUploader from '@grafana/faro-rollup-plugin'
import { resolve } from 'path'
import { readFileSync } from 'fs'

/**
 * Refuse to build if anything has re-enabled emptyOutDir.
 *
 * outDir is docs/ — the Cloudflare Pages root, which also holds the published
 * privacy policy, the About page, _redirects and the social preview, none of
 * which Vite knows about. Because outDir sits outside root, an explicit `true`
 * (in this file, or via `--emptyOutDir` on the CLI) is exactly the escape hatch
 * Vite needs to delete all of it. A comment isn't enough of a guard for that.
 */
function guardOutDir(): Plugin {
  let emptyOutDir: boolean | null | undefined
  return {
    name: 'boxd-card:guard-docs-outdir',
    apply: 'build',
    enforce: 'pre',
    configResolved(config) { emptyOutDir = config.build.emptyOutDir },
    buildStart() {
      if (emptyOutDir !== false) {
        throw new Error(
          'vite.web.config.ts: build.emptyOutDir must stay false. outDir is docs/, the ' +
          'Pages root — emptying it would delete privacy/, about/, _redirects and ' +
          'social-preview.png.',
        )
      }
    },
  }
}

/**
 * Vite config for the web app, which is the apex of boxd-card.com (docs/).
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
      guardOutDir(),
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
    // The app is the apex. Cloudflare Pages does not honour 200-rewrites in
    // _redirects (see docs/_redirects and commit e897134), so whatever serves
    // `/` has to physically be docs/index.html — it can't be a rewrite to a
    // subdirectory. Hence base '/' and outDir docs/ rather than docs/app.
    base: '/',

    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
    },

    build: {
      outDir: resolve(__dirname, 'docs'),
      // NEVER wipe docs/ — it holds hand-written siblings the build knows
      // nothing about: _redirects, about/, privacy/, landing/assets/, the
      // social preview and the *.md notes. The build only writes index.html,
      // assets/ and favicon.svg. Stale hashed bundles are cleared by the
      // `rm -rf docs/assets` step in the build:web script instead.
      emptyOutDir: false,
      // Emit source maps so the Faro upload plugin can read them at build time
      // and Grafana can un-minify stack traces. The .map files are not
      // committed and so are not published to Pages — Faro resolves them by
      // the bundle id it injects, not by URL.
      sourcemap: true,
    },

    server: {
      port: 5174,
    },
  }
})
