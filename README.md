# ![Boxd Card](public/icons/icon48.png) Boxd Card

[![Latest release](https://img.shields.io/github/v/release/michaellambgelo/boxd-card)](https://github.com/michaellambgelo/boxd-card/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/michaellambgelo/boxd-card/pr-checks.yml?branch=main&label=CI)](https://github.com/michaellambgelo/boxd-card/actions/workflows/pr-checks.yml)

A Chrome extension that generates shareable image cards from your Letterboxd profile — last watched films, favorites, diary entries, lists, or reviews.

Open the extension on a supported Letterboxd page, pick a card type, click **Generate Card**, and get a PNG you can download or copy straight to your clipboard.

Custom posters (a Letterboxd Pro/Patron feature) are supported automatically — they're already rendered in the DOM by the time the extension reads them, so no API access is required.

## Card types

| Type | Required page | Count |
|------|--------------|-------|
| Last Four Watched | `letterboxd.com/<username>/` | 4 |
| Favorites | `letterboxd.com/<username>/` | up to 4 |
| Recent Diary | `letterboxd.com/<username>/diary/` | 4, 10, or 20 |
| List | `letterboxd.com/<username>/list/<slug>/` | 4, 10, or 20 |
| Review | `letterboxd.com/<username>/reviews/` or `…/film/<slug>/` | 1–4 |

The extension icon is always visible. The Generate button is inactive on non-Letterboxd pages. While on Letterboxd, if the selected card type doesn't match the current page, a navigation hint appears pointing to the correct URL.

## How it works

The extension reads film metadata and poster images directly from the Letterboxd page DOM — no backend, no API calls, no CORS workarounds. Poster images are fetched cross-origin by the background service worker (which has the necessary host permissions) and drawn to an HTML5 Canvas to produce the final PNG.

```
Letterboxd page DOM
        │  chrome.runtime.sendMessage
        ▼
  Content Script       reads titles, ratings, poster URLs, username, dates
        │  message response
        ▼
  Popup UI             drives the generation flow
        │
        ├─► Background Service Worker   fetches poster image blobs
        │
        ▼
  Canvas Renderer      draws the card
        │
        ▼
  Download PNG  /  Copy to clipboard
```

## Card layouts

Six layout formats are available in the extension settings. See [docs/card-layouts.md](docs/card-layouts.md) for detailed dimensions, grid arrangements, and ASCII diagrams for every layout and film count.

| Layout | Dimensions | Best for |
|--------|-----------|----------|
| Landscape | 1200px wide, variable height | Twitter, Discord |
| Square | 1080 × 1080 | Instagram grid |
| 4:5 | 1080 × 1350 | Instagram feed |
| 3:4 | 1080 × 1440 | Instagram feed |
| Story | 1080 × 1920 | Instagram Stories, TikTok |
| Banner | 1500 × 750 | Twitter header |

For 1-4 films, each layout uses a fixed canvas size with posters and text arranged to fill the space. For 5-20 films, the canvas height grows dynamically to fit additional rows.

Review cards use a separate layout system: landscape has dynamic height with poster beside text, story uses a stacked layout (poster above text), and all others use a fixed-height side-by-side layout that clips long reviews.

On `/username/reviews/` the count selector lets you include 1-4 reviews in a single card, stacked vertically. On a single `/username/film/<slug>/` review page the count is always 1.

Toggleable elements: film title, year (requires title), star rating, card date / watch date, card type label, list title, list description, tags (Review and List), backdrop (Review and List).

## Install

**[Get Boxd Card from the Chrome Web Store](https://chromewebstore.google.com/detail/boxd-card/kcholfdhfcojahebmneeeikelffkokdj)** — one-click install with auto-updates.

Prefer to sideload? Download the [latest release](https://github.com/michaellambgelo/boxd-card/releases) ZIP, unzip it, then:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the unzipped folder

Sideloaded installs don't auto-update, but the extension popup shows an *update available* banner whenever a newer release is published so you'll know when to download a fresh ZIP.

## Development

**Prerequisites:** Node.js 18+

```bash
npm install
npm run dev      # build in watch mode → dist/
npm run build    # one-shot production build
npm run test     # Vitest in watch mode
npm run test:run # single test run (CI)
npm run coverage # v8 coverage report
```

**Loading the extension in Chrome:**

1. Run `npm run build`
2. Open `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select the `dist/` folder

After each subsequent `npm run build`, click the **↺ reload** button on the extension card. For content script changes, also refresh the Letterboxd tab.

## Tech stack

- **Chrome Manifest V3** — service worker, content script, popup
- **React + TypeScript** — popup UI
- **Vite + @crxjs/vite-plugin** — build tooling
- **Canvas 2D API** — card image generation (no external image library)

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read the URL of the current tab to validate it's a supported Letterboxd page |
| `clipboardWrite` | Copy the generated card image to the clipboard |
| `declarativeContent` | Control Generate button availability based on the active tab URL |
| `scripting` | Read the logged-in Letterboxd username from the active tab to personalize the navigation hint (e.g. "Navigate to letterboxd.com/&lt;you&gt;/diary/") |
| `https://letterboxd.com/*` | Fetch poster redirects from the Letterboxd CDN |
| `https://a.ltrbxd.com/*` | Fetch poster images from the primary Letterboxd image CDN |
| `https://s.ltrbxd.com/*` | Fetch static assets (logo) |

Privacy policy: [boxd-card.michaellamb.dev/privacy.html](https://boxd-card.michaellamb.dev/privacy.html)
