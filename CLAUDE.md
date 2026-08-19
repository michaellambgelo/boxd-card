# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Boxd Card** generates shareable PNG image cards from a Letterboxd profile. It ships as **three surfaces** backed by one shared rendering core:

| Surface | Lives in | Served from | How it gets data |
|---------|----------|-------------|------------------|
| **Chrome MV3 extension** | `src/popup/`, `src/content/`, `src/background/` | Chrome Web Store (`kcholfdhfcojahebmneeeikelffkokdj`) | Content script scrapes the page DOM you're already on |
| **Web app** | `src/web/` → built to `docs/` (the apex) | Cloudflare Pages, `boxd-card.com` | Fetches + parses Letterboxd HTML through the proxy worker |
| **About page** | `docs/about/index.html` (hand-written) | Cloudflare Pages, `boxd-card.com/about` | Static marketing page; its Generate CTA hands off to `/?url=…` |

Plus a **Cloudflare Worker** (`worker/`) at `api.boxd-card.com` that the web app and the extension both call.

The extension needs no backend for its core flow — it reads metadata and posters straight from the DOM. The web app can't do that (CORS), so it goes through the worker.

## Card types

Defined in `src/types.ts` as `CARD_TYPE_CONFIGS`. Each entry carries the URL pattern used to validate the page, the hint shown when the page doesn't match, and a `proOnly` flag.

| CardType | Label | Required URL |
|----------|-------|-------------|
| `last-four-watched` | Last Four Watched | `letterboxd.com/<user>/` or `/<user>/films/` |
| `favorites` | Favorites | `letterboxd.com/<user>/` |
| `recent-diary` | Recent Diary | `letterboxd.com/<user>/diary/` or `/films/diary/` |
| `list` | List | `letterboxd.com/<user>/list/<slug>/` |
| `review` | Review | `/<user>/reviews/` or `/<user>/film/<slug>/[n]/` |
| `stats` | Stats | `/<user>/stats/` or `/<user>/year/<yyyy>/` — **Pro only** |

- `ListCount` = `4 | 10 | 20` — Recent Diary, List, Stats.
- `ReviewCount` = `1 | 2 | 3 | 4` — Review. Only offered on `/reviews/` list pages; a single film review page always yields exactly 1.
- `Layout` = `landscape | square | 4:5 | 3:4 | story | banner` — output aspect ratio.
- `StatsCategory` = `summary | most-watched | highest-rated | by-week | breakdown | genres | countries | languages | milestones`, each with a `renderMode` (`poster-grid | summary | chart | bar-chart | milestones`) and a `pages` availability (`both | year`).

**Stats is extension-only.** Letterboxd blocks stats-page requests from external services, so the web app rejects those URLs with an explanatory message rather than failing at fetch time.

### The two stats pages are not interchangeable

`/<user>/stats/` (all-time) and `/<user>/year/<yyyy>/` (Year in Review) both match the
`stats` `urlPattern` and are both built from the same `yir-*` stylesheet, but they expose
**different sections**. Verified against live authenticated Pro markup, 2026-08:

| category | `/stats/` | `/year/<yyyy>/` | anchor selector |
|---|---|---|---|
| `summary` | yes | yes | `.yir-member-stats .yir-member-statistic` |
| `most-watched` | yes\* | yes\* | `.yir-most-rewatched` / `div.milestone-mostwatched` |
| `highest-rated` | yes | yes | `a[name="variance-high"]` |
| `genres` / `countries` / `languages` | yes | yes | `.film-breakdown-graph-bar` |
| `by-week` | **no** | yes | `#entries-by-week-films` |
| `breakdown` | **no** | yes | `.js-personal-pies[data-ratios]`, `#ratingspread` |
| `milestones` | **no** | yes | `.milestone-group.-diaryevents` |

\* `most-watched` reads different markup per page and branches on `isYearPage()` — it is the
only category that was ever page-aware, which is why it alone survived.

Encoded as `pages` in `STATS_CATEGORY_CONFIGS`; `isStatsCategoryAvailable()` is the single
check, shared by the popup (disables the option, `(Year in Review only)`) and the content
script (refuses to scrape, before scrolling).

`/<user>/stats/<yyyy>/` **404s** — the `urlPattern` accepted it for a while. Don't re-add it.

**Never let a stats scrape return an empty-but-truthy payload.** `scrapeMilestones()`
returning `{diaryMilestones: []}` on a page with no container is what produced a card with a
header and footer wrapped around nothing: the popup's "is there data?" check only tested for
*presence*. `statsScrapeEmptyMessage()` is the backstop — it turns any future selector rot
into a visible error instead of a blank card.

## Architecture

```
                    ┌──────────────────────────────┐
   EXTENSION        │  Letterboxd page DOM         │
                    └──────────────┬───────────────┘
                                   │ scrapes in-page
                    ┌──────────────▼───────────────┐
                    │ content/index.ts             │  GET_FILM_DATA message
                    └──────────────┬───────────────┘
                                   │ FilmDataResponse
                    ┌──────────────▼───────────────┐
                    │ popup/Popup.tsx              │
                    └───┬──────────────────────┬───┘
                        │ FETCH_IMAGE          │
                        │ FETCH_TMDB           │
                    ┌───▼──────────────────┐   │
                    │ background/          │   │
                    │ service-worker.ts    │   │
                    └──────────────────────┘   │
                                               │
   WEB APP                                     │
   ┌────────────────────┐                      │
   │ web/App.tsx        │                      │
   │ web/webScraper.ts  │──── proxy fetch ──┐  │
   └──────────┬─────────┘                   │  │
              │                             │  │
              │                    ┌────────▼──▼────────┐
              │                    │ worker/index.ts    │
              │                    │ api.boxd-card.com  │
              │                    │  /?url=  /tmdb     │
              │                    └────────────────────┘
              │
   BOTH       ▼
   ┌──────────────────────────────────────────┐
   │ canvas/renderCard.ts   → PNG Blob        │
   │ altText.ts             → alt text        │
   └──────────────────────────────────────────┘
              │
              ▼   Copy to clipboard / Download / Share
```

**Shared between surfaces:** `canvas/renderCard.ts`, `altText.ts`, `types.ts`, `storage/settings.ts`, `shared/tmdb.ts`. The two scrapers (`content/index.ts` for the live DOM, `web/webScraper.ts` for fetched HTML) deliberately mirror each other's selectors but stay separate — the extension can read lazily-resolved `img.src`, the web app can only see `data-poster-url`.

## Project structure

```
boxd-card/
├── manifest.json                  # MV3 manifest (permissions, content-script matches)
├── src/
│   ├── types.ts                   # CardType, ListCount, Layout, StatsCategory, CARD_TYPE_CONFIGS
│   ├── altText.ts                 # generateAltText() — accessible description of a card
│   ├── assets/                    # Letterboxd + TMDB logos (SVG)
│   ├── popup/                     # Extension popup: Popup.tsx, main.tsx, index.html, CSS module
│   ├── content/index.ts           # In-page DOM scrapers (all card types + stats)
│   ├── background/service-worker.ts  # FETCH_IMAGE / FETCH_TMDB + declarativeContent
│   ├── canvas/renderCard.ts       # Canvas renderer; renderCard, computeLayout, wrapText, loadImage
│   ├── shared/tmdb.ts             # TmdbFilmData, slugFromPosterUrl, mergeTmdb, didUseTmdb
│   ├── storage/settings.ts        # UserSettings + RememberedUser (chrome.storage / localStorage)
│   └── web/
│       ├── App.tsx                # Web app UI + generation pipeline
│       ├── main.tsx               # Entry point — ORDER MATTERS, see Telemetry below
│       ├── webScraper.ts          # Fetch + parse Letterboxd HTML via the proxy
│       ├── tmdbClient.ts          # Calls the worker's /tmdb route
│       ├── faro.ts                # Grafana Faro init + track()/startAction()
│       ├── telemetryPrivacy.ts    # URL/message scrubbing — see Telemetry below
│       ├── handoff.ts             # Captures + strips the landing page's ?url= param
│       └── index.html             # Web app HTML shell
├── worker/
│   ├── index.ts                   # Cloudflare Worker: /?url= proxy + /tmdb
│   ├── wrangler.toml              # Deploy config (rate-limit binding documented here)
│   └── tsconfig.json              # Workers-runtime typecheck (separate from the app)
├── docs/                          # Cloudflare Pages root — MIXES build output with hand-written pages
│   │                              #   Build output: index.html, assets/, favicon.svg (from src/web)
│   │                              #   Hand-written: about/, privacy/, landing/assets/, _redirects, *.md
│   │                              #   → vite.web.config.ts MUST keep emptyOutDir:false or the build
│   │                              #     would delete the privacy policy and the redirects file.
│   ├── index.html                 # Landing page (hand-written)
│   ├── privacy/index.html         # Privacy policy — a promise backed by code, keep in sync
│   ├── app/                       # BUILD OUTPUT of src/web — committed, do not hand-edit
│   └── _redirects                 # Cloudflare Pages redirects
├── eslint.config.mjs
├── tsconfig.json                  # App + tests (DOM types)
├── tsconfig.node.json             # Build configs (Node types)
└── vite.config.ts / vite.web.config.ts
```

## Development commands

```bash
npm run dev        # extension: build in watch mode → dist/
npm run build      # extension: typecheck + one-shot production build
npm run dev:web    # web app dev server (localhost:5174) — start the worker first
npm run build:web  # web app: typecheck + build → docs/ (apex)
npm run typecheck  # tsc --noEmit across all three tsconfigs (app / node / worker)
npm run lint       # ESLint, zero-warning policy
npm run test       # Vitest watch
npm run test:run   # single run (CI)
npm run coverage   # Vitest + v8 coverage
```

Worker, from `worker/`:
```bash
npx wrangler dev --port 8787   # local; pairs with npm run dev:web
npx wrangler deploy
npx wrangler secret put TMDB_API_KEY   # v4 "API Read Access Token", NOT the v3 key
```

`wrangler` is pinned in `devDependencies` — don't let `npx` pull a floating version.

**Loading the extension:** `npm run build` → `chrome://extensions` → Developer mode → Load unpacked → `dist/`. Reload after each build; also refresh the Letterboxd tab for content-script changes.

**PostToolUse hook:** any Edit/Write triggers `.claude/hooks/run-tests.sh` → `npm run test:run`.

**Pre-commit hook** (`.githooks/pre-commit`, wired up by `npm install`): rebuilds the apex app (`docs/index.html`, `docs/assets/`, `docs/favicon.svg`) when `src/web/`, `vite.web.config.ts`, `package.json`, or `.env.production` are staged, and reconciles `package-lock.json` when `package.json` is staged.

## Environment

`.env.production` is committed (public URLs only). `.env.local` is gitignored and holds the Grafana credentials.

| Var | Used by | Notes |
|-----|---------|-------|
| `VITE_PROXY_URL` | web app | Worker base. `http://localhost:8787` for local dev |
| `VITE_FARO_PROXY_URL` | web app | Faro proxy base; unset disables telemetry entirely |
| `VITE_APP_VERSION` | web app | Optional — defaults to `package.json` version, set in `vite.web.config.ts` |
| `GRAFANA_FARO_API_KEY` | build only | Enables source-map upload on production builds. Needs the `frontend-observability:write` scope |
| `GRAFANA_FARO_APP_ID` | build only | Defaults to `4021` |

## Telemetry and privacy — read before touching `src/web/`

`docs/privacy/index.html` is a **published promise**, and parts of it are enforced in code. It states we do not collect the Letterboxd URL you paste, nor any film or list slug.

That's non-trivial to honour, because every request the web app makes puts exactly that data in a query string (`/?url=https%3A%2F%2Fletterboxd.com%2F<user>%2F`, `/tmdb?slug=<film>`), and Faro records full URLs automatically in **five** places:

1. `meta.page.url` (`location.href`) — attached to every signal.
2. OTel fetch spans set `http.url` to the full request URL.
3. Faro's trace exporter flattens *every* span attribute into `faro.tracing.*` events — so (2) again.
4. `faro.performance.resource` events track fetch/xhr by default and carry `name: <full URL>`.
5. Console instrumentation captures `console.warn` and `console.error` by default (only DEBUG/TRACE/LOG are off), so any diagnostic interpolating a film title ships it.

The defences, all in `src/web/`:

- **`handoff.ts`** — captures and strips `?url=` from the address bar. `main.tsx` calls it **before `initFaro()`**. Keep that order; reversing it re-opens leak (1).
- **`faro.ts`** — `applyCustomAttributesOnSpan` rewrites `http.url` at the span level, which fixes (2) *and* (3), because the exporter reads span attributes after the span ends. `beforeSend` runs `scrubTransportItem` for (1) and (4).
- **`telemetryPrivacy.ts`** — `sanitizeUrlForTelemetry` keeps origin + pathname and drops query + fragment; `sanitizeErrorMessage` strips URLs and quoted identifiers from free text.
- **Diagnostics are content-free by convention** — no film titles, slugs, or poster URLs in `console.warn`, and thrown scraper errors don't quote slugs either, because they end up in `card_generate_failed`.

If you add a `track()` call, a `console.warn`, or a new fetch, check it against the policy. `telemetryPrivacy.test.ts` covers the scrubbing itself.

**The extension sends no telemetry at all** — Faro is imported only from `src/web/`, and the policy says so. Don't import it anywhere else.

## Worker notes (`worker/index.ts`)

Two routes:
- `GET /?url=<target>[&accept=image]` — proxies an allowlisted host (`letterboxd.com`, `a.ltrbxd.com`, `s.ltrbxd.com`, `boxd.it`, `image.tmdb.org` and subdomains). 60s cache.
- `GET /tmdb?slug=<letterboxd-slug>` — scrapes `data-tmdb-id` off the film page, then queries TMDB. 7-day cache. Needs `TMDB_API_KEY` or returns 503.

Things that are load-bearing:
- **Every worker-generated response must carry CORS headers** — use `errorResponse()`, never a bare `new Response(msg, {status})`. Without them the browser rejects the response outright, `fetch` throws a TypeError instead of resolving, and the web app can't read the status to show a useful message.
- **The allowlist is checked twice** — once on the requested URL, once on `upstream.url` after redirects. `boxd.it` is a redirector; a one-sided check could be walked off the allowlist.
- **`accept=image` responses must actually be images.** Letterboxd's CDNs host user-uploaded content; relaying an HTML content type would let it render as a document on our origin.
- **Never log response bodies.** `[observability.logs] persist = true`, and those bodies are Letterboxd page content. Status + `cf-ray` only.
- **Rate limiting** is wired but not enabled — the worker reads an optional `RATE_LIMITER` binding and fails open without it. See `wrangler.toml` for how to switch it on. Worth doing: abuse of this open proxy means Letterboxd sees the traffic as ours.

## DOM selectors (verified against live Letterboxd HTML)

Both scrapers rely on these. Letterboxd changes them without notice; when a card type breaks, check here first.

**LazyPoster** — the shared pattern behind nearly every card type:
```
.react-component[data-component-class="LazyPoster"]
  @data-item-name              "Dune (2021)"   ← title + year
  @data-poster-url             "/film/dune-2021/image-150/"
  @data-postered-identifier    '{"lid":"fA7G","uid":"film:371378","type":"film",…}'
  @data-resolvable-poster-path '{"postered":{"uid":"film:371378"},"posteredBaseLink":"/film/dune-2021/",…}'
img.image                            ← resolved poster, or an empty-poster placeholder
```
`img.src` starts as `empty-poster-*.png` and is swapped in by Letterboxd's React after load. The extension checks for `empty-poster` and falls back to `data-poster-url`; the web app always uses `data-poster-url`, since fetched HTML is never lazily resolved.

**Film id — `data-film-id` is gone.** Letterboxd removed it; verified against live markup, where it appears zero times while the two JSON attributes above appear on every poster. The numeric id now lives only inside `data-postered-identifier` (top-level `uid`) or `data-resolvable-poster-path` (`postered.uid`), as `"film:371378"`. `filmIdFromLazyPoster()` — duplicated in `content/index.ts` and `web/webScraper.ts` — prefers the legacy attribute if it ever returns, then parses the uid out.

Note the attributes are single-quoted with `&quot;`-escaped JSON in the raw HTML; `getAttribute()` hands back the decoded string, so `JSON.parse` works in both the live DOM and under `DOMParser`.

Getting this wrong is not obvious: `filmId` has exactly one consumer, the milestone poster map (`Popup.tsx` → `renderCard.ts`, `posterMap.get(entry.filmId)`). When every id is `''` the map collapses to a single key and **every milestone renders the same poster** rather than falling back to the grey placeholder.

**Custom posters.** `data-resolvable-poster-path` carries `preferredAlternativePosterId` when Letterboxd renders a non-default poster — a Pro/Patron member's own choice, or a film-level preferred alternative. Default posters omit the field. `isCustomPoster()` reads it, and `mergeTmdbKeepCustomPoster()` in `shared/tmdb.ts` then keeps the Letterboxd poster while still enriching metadata and backdrop from TMDB. Note a member can set a *different* custom poster per diary entry, so the same film legitimately appears twice in one card with different artwork — that is not a bug.

**Poster size is a request, not a fixed asset.** In a resized CDN URL (`a.ltrbxd.com/resized/...`), the `0-<w>-0-<h>-crop` segment asks the CDN to render that size on demand. Verified live: for one image, `0-70-0-105` (2 KB), `0-230-0-345` (12 KB), `0-460-0-690` (15 KB) and `0-1000-0-1500` (77 KB) all return 200.

This matters because page markup serves poster thumbnails as small as **70×105** while cards draw posters at **200–208px** (grids) and up to **280px** (Milestones) — so a scraped URL used as-is is upscaled ~3× onto the canvas and goes illegible. `upscaleLetterboxdPoster()` in `shared/posters.ts` normalises scraped poster URLs to `0-460-0-690` at the two image-fetch choke points (`fetchPosterDataUrl` in the popup, `fetchImageDataUrl` in the web app).

It only shows on posters we *keep* rather than replace — custom posters, and any card generated with TMDB enrichment off — because TMDB posters come from `/t/p/original`. That asymmetry is why it presented as "some posters look bad" rather than a uniform quality ceiling.

Only 2:3 crops are rewritten. **Avatars are 1:1** and have their own separate rewrite at the scrape sites (`0-48-0-48-crop` → `0-80-0-80-crop`, `content/index.ts:566`); **backdrops** use a different four-number form (`1200-1200-675-675-crop`) and don't match the pattern. Both travel through the same image-fetch path, so widening them here would distort them.

Do **not** use the sibling `hasDefaultPoster` field for this — it stays `true` even when a custom poster is displayed, because it describes the film, not what's on screen.

| What | Selector |
|------|----------|
| Recent activity (last four) | `section#recent-activity li.griditem` (first 4) |
| Films page fallback | `ul.poster-list li.poster-container` / `ul.grid li.griditem` |
| Favorites | `section#favourites li.griditem` (first 4; never has ratings) |
| Diary rows | `table#diary-table tbody tr.diary-entry-row` |
| Diary rating / date | `td.col-rating .hide-for-owner .rating`, `.col-monthdate .monthdate a.month\|a.year`, `.col-daydate a.daydate` |
| List entries | `ul.js-list-entries li.posteritem, li.film-detail` |
| List meta | `.list-title-intro h1.title-1`, `.list-title-intro .body-text p` (skip paragraphs starting "Updated") |
| Tags | `ul.tags li a` |
| Review list items | `div.viewing-list div.listitem.js-listitem` |
| Review title / year | `.inline-production-masthead h2.primaryname a`, `.inline-production-masthead .releasedate a` |
| Review rating | `.content-reactions-strip .inline-rating svg` → `@aria-label` (`"★★★★½"`) |
| Review body | `.js-review-body p` |
| Page owner | `document.body.dataset.owner` |
| Logged-in user | `window.person` (extension, via `chrome.scripting` MAIN world) / inline `<head>` script (web) |
| Backdrop | `[data-backdrop-retina]`, `[data-backdrop]` |

**Diary month/year carry forward** — only the first row of each month carries `a.month`/`a.year`; subsequent rows inherit.

**Truncated reviews** — on list pages `.js-review-body` also carries `data-full-text-url="/s/full-text/viewing:{id}/"`. Fetch it for the full text; absent means the review is already complete.

**Parsing fetched HTML: use `DOMParser`, never `innerHTML`.** A detached `<div>` does *not* make markup inert — Chrome still starts image loads for `<img onerror=…>` created via `innerHTML`. In the content script it's worse: inline handlers compile in the *page's* main world, so a Letterboxd sanitizer slip would run script in the viewer's session. Both `fetchFullText` implementations use `DOMParser` for this reason.

## Card layout

`computeLayout(filmCount, titleAreaH)` in `renderCard.ts`:

| filmCount | cols | posterW | posterH | base height |
|-----------|------|---------|---------|-------------|
| ≤ 4 | 4 | 200 | 300 | 560 |
| 5–20 | 5 | 208 | 312 | dynamic |

5-column math: `posterLeft=40`, `gap=20` → `5×208 + 4×20 = 1120 = 1200 − 2×40`.

`titleAreaH` shifts `posterTop`, `footerY`, and `cardHeight` together to make room for text above the grid (list title/description, or the card-type label).

**Drawing order (poster-grid):** background → logo → header date → title area → poster grid → footer.

**Review cards** use a two-pass layout: `measureReviewRows()` sizes each row on a temp canvas, then the real canvas is created at the computed height. Each row is poster (200×300 at `x=40`) plus a right column at `x=270, w=890` holding title → rating → date → tag pills → wrapped review text. Row height is `max(300, contentHeight)`, rows separated by `RV_ROW_GAP = 28`.

**Milestone cards** size their posters instead of fixing them. `milestoneGrid(count, availW, availH)` picks the column count whose poster is largest while fitting the box in *both* axes, then the grid is centred in whatever vertical space is left and each row is centred independently. Ties — common, because posters cap at 280px — go to the arrangement whose own proportions best match the box, plus a penalty for a ragged last row. In practice: one row on landscape/banner, 3×2 on 3:4, taller grids on story. The previous fixed single row at `min(160, slotW−20)` left ~60% of a 3:4 card empty.

**Backdrop** (review + list): drawn blurred (`blur(20px)`, oversized by `3×blur` so the edge fade doesn't show) under `rgba(0,0,0,0.72)`. Falls back silently to `BG_COLOR`.

**Footer:** own profile → `[avatar] username` left, "generated by Boxd Card" right. Someone else's → `[your avatar] you 🔗 [their avatar] them`. Avatars are 32px circular clips.

**Every poster draw is wrapped in try/catch** with a grey placeholder rect, so one failed image degrades the card instead of failing it. `loadImage` has a 10s timeout for the same reason — an image that never settles used to wedge the UI in "Generating…" forever.

## Testing

Vitest + jsdom, `test/setup.ts` mocks `chrome.*` and the Canvas 2D context. `worker/index.test.ts` exercises the worker's `fetch` handler directly.

When fixing a bug, add the test that fails against the old code first — the worker's missing CORS headers survived a full suite because the tests asserted status codes but never headers.

## Known gaps

- Favorites have no star ratings — not in the DOM by design.
- Sparse layouts (1–3 films) centre correctly but look thin. Accepted.
- Stats cards are extension-only; Letterboxd blocks external requests to stats pages.
- `elementText()` falls back to `textContent` under `DOMParser`, so `<br>` in a review doesn't become a newline. Letterboxd reviews rarely use it.
