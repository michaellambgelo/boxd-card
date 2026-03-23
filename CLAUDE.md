# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Boxd Card** is a Chrome MV3 extension that generates shareable PNG image cards from a user's Letterboxd profile. Four card types are supported: Last Four Watched, Favorites, Recent Diary, and List. It works by reading metadata and poster images directly from the Letterboxd page DOM — no backend, no API, no CORS issues.

The extension icon is only shown on `letterboxd.com` pages (via `declarativeContent`). The popup validates the current tab URL against the selected card type and disables the Generate button with a navigation hint when the page doesn't match.

## Tech Stack

- **Chrome Manifest V3** — service worker, content scripts, popup
- **React + TypeScript** — popup UI
- **Vite + @crxjs/vite-plugin 2.0.0** — build tooling (handles MV3 service worker + popup bundling)
- **Canvas API** — card image generation (no external image library)

## Extension Architecture

```
Letterboxd page DOM
        │
        │  chrome.runtime.sendMessage (GET_FILM_DATA)
        ▼
  Content Script                ← injected into letterboxd.com/* pages
  content/index.ts              ← scrapes films, username, dates, list metadata
        │
        │  FilmDataResponse
        ▼
  Popup UI
  popup/Popup.tsx               ← validates URL, drives canvas render, manages UI state
        │
        ├─► Background Service Worker (FETCH_IMAGE)
        │   background/service-worker.ts  ← cross-origin poster image fetching
        │
        ▼
  Canvas Renderer
  canvas/renderCard.ts          ← pure Canvas 2D, no React; exports renderCard, computeLayout, loadImage
        │
        ▼
  Copy to clipboard / Download PNG
```

## Card Types and URL Patterns

Defined in `src/types.ts`:

| CardType | Label | Required URL |
|----------|-------|-------------|
| `last-four-watched` | Last Four Watched | `letterboxd.com/<username>/` |
| `favorites` | Favorites | `letterboxd.com/<username>/` |
| `recent-diary` | Recent Diary | `letterboxd.com/<username>/diary/` or `.../films/diary/` |
| `list` | List | `letterboxd.com/<username>/list/<slug>/` |

`ListCount` = `4 | 10 | 20` — applies to Recent Diary and List types.

## DOM Selectors (verified against live Letterboxd HTML)

### Profile page (`letterboxd.com/<username>/`)

**Recent Activity (Last Four Watched):**
```
section#recent-activity li.griditem   (take first 4)
  .react-component[data-component-class="LazyPoster"]
    @data-item-name    "Dune (2021)"   ← title + year
    @data-film-id      "371378"
    @data-poster-url   "/film/dune-2021/image-150/"
  img.image                            ← src = resolved poster or placeholder
  p.poster-viewingdata .rating         ← star text e.g. "★★★★"
```

**Favorites:**
```
section#favourites li.griditem   (take first 4)
  .react-component[data-component-class="LazyPoster"]
    @data-item-name / @data-film-id / @data-poster-url   (same as above)
  img.image
  (no rating element — favorites have no ratings)
```

**Username:** `document.body.dataset.owner`

### Diary page (`letterboxd.com/<username>/diary/`)

```
table#diary-table tbody tr.diary-entry-row
  td.col-film .react-component[data-component-class="LazyPoster"]
    @data-item-name / @data-film-id / @data-poster-url
  img.image
  td.col-rating .hide-for-owner .rating   ← plain star text (not interactive input)
  td.col-monthdate .monthdate a.month     ← "Mar" (only on first row of each month)
  td.col-monthdate .monthdate a.year      ← "2026" (carry forward for subsequent rows)
  td.col-daydate a.daydate                ← "20"
```

### List page (`letterboxd.com/<username>/list/<slug>/`)

```
ul.js-list-entries li.posteritem
  .react-component[data-component-class="LazyPoster"]
    @data-item-name / @data-film-id / @data-poster-url
  img.image
  (no rating — list entries have no ratings)

.list-title-intro h1.title-1             ← list title
.list-title-intro .body-text p           ← description paragraphs
  (filter out paragraphs starting with "Updated")
```

### Single review page (`letterboxd.com/<username>/film/<slug>/` or `.../film/<slug>/\d+/`)

```
Username: document.body.dataset.owner

section.viewing-poster-container
  .react-component[data-component-class="LazyPoster"]
    @data-poster-url   "/film/groundhog-day/image-150/"
  img.image            ← src = resolved poster or placeholder (same fallback strategy)

header.inline-production-masthead h2.primaryname a   ← film title text "Groundhog Day"
header.inline-production-masthead .releasedate a     ← year text "1993"

.content-reactions-strip span.inline-rating svg      ← @aria-label = "★★★★★" (absent if unrated)

p.view-date a   ← three links in DOM order: day "02", month "Feb", year "2026"
  (preceded by "Watched" / "Rewatched" text node — ignore)

.js-review-body p   ← one <p> per paragraph; use innerText to get text with \n at <br>
  join paragraphs with \n\n
  presence of .js-review-body confirms page is a review (not just a diary entry)
```

### Reviews list page (`letterboxd.com/<username>/reviews/`) — selectors TBD

Needs a DOM sample. Likely each entry uses similar LazyPoster + `.js-review-body` structure
repeated in a list container. Scraper will take first N entries matching the count selector.

### Poster URL strategy

`img.src` starts as a placeholder (`empty-poster-*.png`) and is updated by Letterboxd's LazyPoster React component after load. The scraper checks if `img.src` contains `"empty-poster"` and falls back to `https://letterboxd.com` + `data-poster-url` if so. The background worker then fetches that URL, which redirects to the actual CDN image.

## Card Layout

`computeLayout(filmCount, titleAreaH = 0)` in `renderCard.ts` returns a `CardLayout` object:

| filmCount | cols | posterW | posterH | base cardHeight |
|-----------|------|---------|---------|----------------|
| ≤ 4 | 4 | 200 | 300 | 560 |
| 5–20 | 5 | 208 | 312 | dynamic (POSTER_TOP + rows×372 + 56 + 64) |

5-column math: `posterLeft=40`, `gap=20` → `5×208 + 4×20 = 1120 = 1200 − 2×40`

`titleAreaH` shifts `posterTop`, `footerY`, and `cardHeight` uniformly to make room for optional text above the poster grid. Used for:
- **List type:** list title (32px) and/or description (24px) + padding
- **Non-list types:** card type label (32px) + padding

**Drawing order:** background → logo → header date → title area text → poster grid (image + title + rating + diary date) → footer

**`showDate` behavior:**
- All types except `recent-diary`: today's date in header (right-aligned)
- `recent-diary`: per-film watch date below rating for each poster

## Project Structure

```
boxd-card/
├── manifest.json
├── src/
│   ├── types.ts               # CardType, ListCount, CardTypeConfig, CARD_TYPE_CONFIGS
│   ├── assets/
│   │   └── letterboxd-logo-h-neg-rgb.svg   # official horizontal logo (white on transparent)
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── Popup.tsx          # full UI + generation pipeline
│   ├── content/
│   │   └── index.ts           # DOM scrapers: scrapeRecentActivity, scrapeFavorites,
│   │                          #   scrapeDiary, scrapeList, scrapeListMeta
│   ├── background/
│   │   └── service-worker.ts  # FETCH_IMAGE handler + declarativeContent setup
│   └── canvas/
│       └── renderCard.ts      # Canvas renderer; exports renderCard, computeLayout, loadImage
├── src/content/index.test.ts
├── src/canvas/renderCard.test.ts
├── test/
│   └── setup.ts               # Vitest global mocks (chrome.*, HTMLCanvasElement)
├── vite.config.ts
├── vitest.config.ts
└── package.json
```

## Development Commands

```bash
npm run dev      # build in watch mode → dist/
npm run build    # one-shot production build
npm run test     # Vitest in watch mode
npm run test:run # single test run (CI)
npm run coverage # Vitest with v8 coverage
```

**Loading in Chrome:** `npm run build` → `chrome://extensions` → Enable Developer mode → Load unpacked → select `dist/`. After subsequent builds, click ↺ reload. For content script changes, also refresh the Letterboxd tab.

**PostToolUse hook:** After any Edit/Write to `src/*.ts` files, `.claude/hooks/run-tests.sh` auto-runs `npm run test:run`. Exits 0 silently on pass; exits 2 with stderr on failure.

## Known Gaps

- Favorites have no star ratings by design (not present in the DOM)
- Sparse layout (1–3 films for last-four/favorites) is centered correctly but visually sparse — accepted behavior
