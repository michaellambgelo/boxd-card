# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Boxd Card** is a Chrome browser extension that generates a shareable "Last Four Watched" image card from a user's Letterboxd profile. It works by reading poster images and film metadata directly from the Letterboxd profile page DOM — no backend, no API, no CORS issues.

The extension only activates meaningfully when the user is on a Letterboxd profile page (`letterboxd.com/<username>`). Custom posters (a Letterboxd premium feature) are supported for free because they are already rendered in the DOM.

## Tech Stack

- **Chrome Manifest V3** — service worker, content scripts, popup
- **React + TypeScript** — popup UI
- **Vite** — build tooling (with a Chrome extension plugin, TBD at scaffold time)
- **Canvas API** — card image generation (no external image library)

## Extension Architecture

```
Letterboxd profile page (DOM)
        │
        │  chrome.runtime.sendMessage
        ▼
  Content Script          ← injected into letterboxd.com/* pages
  content/index.ts        ← reads poster <img> srcs, film titles, ratings, username
        │
        │  message response
        ▼
  Popup UI                ← React app in the extension popup
  popup/Popup.tsx         ← requests data from content script, drives canvas render
        │
        ▼
  Canvas Renderer
  canvas/renderCard.ts    ← draws the card; no React, pure Canvas 2D API
        │
        ▼
  Copy to clipboard / Download PNG
```

The **background service worker** fetches poster images cross-origin (from `a.ltrbxd.com` and `letterboxd.com`) on behalf of the popup, since Canvas `drawImage()` taints the canvas with cross-origin images unless fetched via the extension context. The content script reads only metadata from the DOM; the background worker fetches the actual image blobs.

## DOM Selectors (confirmed from live profile HTML)

The content script targets `letterboxd.com/<username>/` (the profile page, not diary/films/etc.).

```
section#recent-activity
  ul.grid.-p150
    li.griditem                                     ← one per film (take first 4)
      .viewing-poster-container
        .react-component[data-component-class="LazyPoster"]
          @data-item-name       "Dune (2021)"       ← title with year
          @data-item-slug       "dune-2021"          ← used to build poster fetch URL
          @data-film-id         "371378"
          @data-poster-url      "/film/dune-2021/image-150/"  ← relative poster endpoint
          @data-resolvable-poster-path  JSON:
            { "preferredAlternativePosterId": "11095",  ← present if custom poster
              "postered": { "uid": "film:371378", ... }, ... }
          .poster.film-poster
            img.image           ← src starts as empty placeholder; React updates it
        p.poster-viewingdata[data-item-uid="film:371378"]
          .rating               ← text content = "★★" / "★★★½" / "★★★★★" etc.
```

**Username:** `document.body.dataset.owner` (e.g. `"michaellamb"`)

**Custom poster detection:** `window.person.getCustomPoster("film:371378")` returns the alternative poster ID string if set, or `null`. This function is injected by Letterboxd's own page script. `data-resolvable-poster-path` contains the same `preferredAlternativePosterId` value in JSON form.

**Poster fetch strategy:** The poster `img.src` is initially the empty placeholder (`empty-poster-150-DtnLDE3k.png`) in server-rendered HTML and is updated by Letterboxd's React `LazyPoster` component after the page loads. Two approaches to get the real poster URL:
1. *(Preferred)* Wait for `img.src` to differ from the placeholder (use `MutationObserver` or check on `document_idle`), then read the resolved `src` — this captures custom posters automatically.
2. *(Fallback)* Fetch `https://letterboxd.com` + `data-poster-url` from the background service worker, which redirects to the actual CDN image.

**Date availability:** Per-film watch dates are **not** present in the `#recent-activity` poster grid and are not used. The optional date on the card is the card's generation date (`new Date()`), not a diary date.

## Letterboxd Logo

The three-dot wordmark visible in the masthead header is rendered via CSS image replacement on `h1.site-logo a.logo`. The SVG decal (the standalone "L" lettermark) is at:
```
https://s.ltrbxd.com/static/img/letterboxd-decal-l-16px-DorUFlWn.svg
```
The three colored dots logo (orange `#FF8000`, green `#00C030`, teal `#40BCF4`) + wordmark is a separate asset loaded via CSS. To get its URL, inspect `window.getComputedStyle(document.querySelector('.site-logo .logo')).backgroundImage` on the live page. The background service worker can then fetch it as a blob for use in the Canvas renderer.

## Card Specification

**Layout:** Four film posters side-by-side in a single row (landscape card).

**Card elements:**
- 4 film poster images (sourced from DOM — respects custom posters automatically)
- Film title under each poster (strip the year in parentheses for cleaner display — TBD)
- Star rating under each poster (render the Unicode star characters directly: ★★★½)
- Letterboxd three-dot logo + wordmark
- Letterboxd username of the profile being viewed (e.g. `letterboxd.com/michaellamb`)
- Card generation date *(optional, user-toggled)* — the date the card was made, formatted as e.g. "March 20, 2026". Not a per-film watch date. Implemented as `new Date()` at render time.

**Image output:** PNG via `canvas.toBlob()`. Export: copy to clipboard (`navigator.clipboard.write`) + download (`<a download>`).

## Key Constraints & Decisions

- **DOM-only data source.** No Letterboxd API, no RSS feed. The extension must be used while on `letterboxd.com/<username>` (the profile page).
- **Chrome / Chromium only** for v1.
- **No backend.** No Cloudflare Worker, no GitHub Actions.
- **Canvas cross-origin:** Poster images from `a.ltrbxd.com` must be fetched via the background service worker (which has cross-origin fetch permission) and passed to the popup as object URLs or data URLs before drawing to Canvas. Fetching them directly in the popup or content script context will taint the canvas and block `toBlob()`.
- **Content script scope:** Read-only. No DOM mutations.

## Project Structure (planned)

```
boxd-card/
├── manifest.json
├── src/
│   ├── popup/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── Popup.tsx
│   ├── content/
│   │   └── index.ts        # DOM scraper — runs on letterboxd.com/*
│   ├── background/
│   │   └── service-worker.ts
│   └── canvas/
│       └── renderCard.ts   # Pure Canvas 2D card renderer
├── public/
│   └── icons/
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Development Commands

*(To be filled in after project scaffold)*

```bash
npm run dev    # build in watch mode, load unpacked from dist/
npm run build  # production build
```

To test during development: build the extension, then load it as an unpacked extension in Chrome via `chrome://extensions` → "Load unpacked" → select the `dist/` folder.
