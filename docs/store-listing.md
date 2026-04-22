# Chrome Web Store listing — source of truth

This file is the canonical copy of the text that appears on the Chrome Web Store
listing for Boxd Card. The Web Store dashboard is a paste target, not the source.
When the listing changes, edit this file first, then copy into the dashboard.

Listing URL: <https://chromewebstore.google.com/detail/boxd-card/kcholfdhfcojahebmneeeikelffkokdj>

## Short description (132 char limit)

> Generate a shareable image card from your Letterboxd profile.

## Detailed description

> Boxd Card turns your Letterboxd activity into a shareable PNG image card you
> can post anywhere. Supported card types:
>
> - Last Four Watched
> - Favorites
> - Recent Diary (4, 10, or 20 entries)
> - Lists (4, 10, or 20 entries)
> - Reviews (1–4)
>
> Open the extension on a supported Letterboxd page, pick a card type, click
> Generate Card, and get a PNG you can download or copy straight to your
> clipboard. Six layout presets are available: landscape, square, 4:5, 3:4,
> story, and banner.
>
> **How it works.** Boxd Card runs locally in your browser by default: it reads
> film titles, ratings, and poster URLs directly from the Letterboxd page DOM
> and draws them onto an HTML5 Canvas. No account, no analytics, no tracking.
>
> **TMDB enrichment (optional, off by default).** In settings you can enable
> TMDB enrichment to pull backdrops, higher-resolution posters, and film
> metadata from The Movie Database. When enabled, the extension sends the
> Letterboxd film slug (for example `dune-2021`) to our Cloudflare Worker,
> which queries TMDB and returns public film data. Nothing else is transmitted;
> no username, account, or personal data is sent. When TMDB enrichment is off
> the extension never contacts our server.
>
> Full privacy policy: <https://boxd-card.michaellamb.dev/privacy.html>
>
> Source code (MIT-licensed): <https://github.com/michaellambgelo/boxd-card>
>
> This product uses the TMDB API but is not endorsed or certified by TMDB.
> Boxd Card is not affiliated with or endorsed by Letterboxd.

## Permissions justifications (Privacy tab)

| Permission | Justification |
|---|---|
| `activeTab` | Read the URL of the current tab to validate it is a supported Letterboxd page before enabling the Generate button. |
| `clipboardWrite` | Copy the generated card image to the clipboard when the user clicks Copy. |
| `declarativeContent` | Show the extension action icon only on `letterboxd.com` and hide it everywhere else. |
| `scripting` | Read the logged-in Letterboxd username from the active tab to personalize the navigation hint (e.g. "Navigate to letterboxd.com/&lt;you&gt;/diary/"). |
| `storage` | Persist the user's display preferences (layout, toggles, and the TMDB-enrichment opt-in state). |
| Host `letterboxd.com` | Resolve Letterboxd poster redirect URLs. |
| Host `a.ltrbxd.com` | Fetch poster images from Letterboxd's primary image CDN. |
| Host `s.ltrbxd.com` | Fetch Letterboxd static assets (logo). |
| Host `boxd-card.michaellamb.workers.dev` | Only used when the user enables TMDB enrichment in settings. The extension requests film metadata from this Cloudflare Worker, which proxies to TMDB. The extension makes no requests to this host unless the feature is on. |
| Host `image.tmdb.org` | Only used when TMDB enrichment is enabled. Fetches the posters and backdrops returned by the worker. |

## Single-purpose description

> Generate shareable image cards from Letterboxd profile pages.

## Data usage disclosures (Privacy practices tab)

We do **not** collect any of the following:

- [ ] Personally identifiable information
- [ ] Health information
- [ ] Financial and payment information
- [ ] Authentication information
- [ ] Personal communications
- [ ] Location
- [ ] Web history
- [ ] User activity

We **do** interact with "Website content" in one narrow sense when the user
opts in:

- [x] **Website content** — only when the user enables TMDB enrichment in
  settings. The extension sends the Letterboxd film slug from the active page
  (e.g. `dune-2021`) to our Cloudflare Worker so it can look up TMDB metadata.
  The slug is public website content, not user-identifying data.

Certifications (all required to be true, and are true):

- [x] I do not sell or transfer user data to third parties, apart from the
  approved use cases.
- [x] I do not use or transfer user data for purposes unrelated to the item's
  single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for
  lending purposes.

## Change log

- **2026-04 (v0.7.0 candidate)** — Added TMDB enrichment as an optional,
  off-by-default feature. Added host permissions for
  `boxd-card.michaellamb.workers.dev` and `image.tmdb.org`. Updated detailed
  description and privacy policy with conditional disclosure language.
- **Earlier** — see commit history on GitHub.
