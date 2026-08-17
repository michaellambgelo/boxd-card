import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * Flat ESLint config.
 *
 * The workspace convention is a zero-warning lint policy; this project had no
 * lint tooling at all. `npm run lint` runs with --max-warnings 0 so a warning
 * fails the same way an error does.
 *
 * Type-aware rules are deliberately not enabled: the three tsconfigs
 * (app / node / worker) already run under `npm run typecheck`, and duplicating
 * that through the linter buys noise rather than coverage.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'docs/**',        // build output + hand-written static pages
      'coverage/**',
      'graphify-out/**',
      'node_modules/**',
      'worker/node_modules/**',
    ],
  },

  // ── Browser + extension sources ──────────────────────────────────────────
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2021,
      // `webextensions` is the key that declares `chrome` — there is no
      // `globals.chrome`, and spreading undefined would silently declare nothing.
      globals: { ...globals.browser, ...globals.webextensions },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Unused args are fine when prefixed with _ — the codebase already uses
      // that convention for ignored callback parameters.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
    },
  },

  // ── Tests ────────────────────────────────────────────────────────────────
  {
    files: ['**/*.test.{ts,tsx}', 'test/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      // Test fixtures legitimately reach for `any` when standing in for SDK
      // payload shapes.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // ── Cloudflare Worker ────────────────────────────────────────────────────
  {
    files: ['worker/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.worker, fetch: 'readonly', Response: 'readonly', Request: 'readonly', URL: 'readonly', console: 'readonly', TextDecoder: 'readonly' },
    },
  },

  // ── Build config + scripts (Node) ────────────────────────────────────────
  {
    files: ['*.config.{ts,js,mjs}', 'scripts/**/*.mjs'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
)
