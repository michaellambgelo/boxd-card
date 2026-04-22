# TMDB enrichment ideas — discussion doc

Status: draft, for review
Author: generated 2026-04-22
Scope: fields TMDB exposes that Boxd Card *could* surface on generated cards,
beyond the minimal set it currently uses.

This is **not a plan**. It's a survey — each field has a fit note, a layout
note, and a cost/risk note. Pick the ones worth pursuing; reject the rest.

---

## What we already fetch

Our Cloudflare Worker calls `https://api.themoviedb.org/3/{type}/{id}?append_to_response=credits`
and returns this shape (`worker/index.ts:246-259`):

```
tmdbId, type ('movie' | 'tv'),
title, releaseDate, runtime, overview,
director, genres,
posterUrl, backdropUrl
```

| Field | Currently rendered? | Where |
|---|---|---|
| `posterUrl` | ✅ | Card poster (Popup picks `tmdbPosterUrl || posterUrl`) |
| `backdropUrl` | ✅ | Review/List backdrop fallback |
| `title`, `releaseDate` | ❌ | Merged but not drawn (we use the Letterboxd-scraped title/year) |
| `runtime` | 🟡 Phase 1 | Review cards only, opt-in toggle |
| `overview` | 🟡 Phase 1 | Review cards only, opt-in toggle |
| `director` | 🟡 Phase 1 | Review cards only, opt-in toggle |
| `genres` | 🟡 Phase 1 | Review cards only, opt-in toggle |

So most of the data we already pay to fetch still isn't visible on the card.
The items below are *additional* fields we could request from TMDB with no
change (or only an `append_to_response=` tweak) on the worker side.

---

## Candidate fields — already in the base `/movie/{id}` response

### Tagline
**Fit:** very high. Taglines are designed to be pithy and shareable — the
perfect shape for a poster-grid sub-header, a Review card hero line, or a
List card intro. Examples: "In space, no one can hear you scream"
(*Alien*); "The spice must flow" (*Dune*).

**Layout:** Review cards (under title, italic, subtle color); List cards
(below list title/description); poster-grid cards (too narrow).

**Cost:** zero — field is already in the base response; just add it to the
worker's projection.

**Risk:** some films have no tagline (empty string). Toggle must degrade
silently.

---

### TMDB rating (`vote_average`, `vote_count`)
**Fit:** medium. Adds a second rating axis next to the user's Letterboxd
stars. Could read as "7.8 ★ TMDB (8.2k votes)" — but introduces rating-system
confusion (5-star Letterboxd vs 10-point TMDB). Could be useful on cards
where the user hasn't rated the film themselves (Favorites often).

**Layout:** small text chip near the user's star rating. Avoid on Review
cards to keep the personal rating front and center.

**Cost:** zero — already in the base response.

**Risk:** TMDB ratings are crowdsourced and can differ sharply from Letterboxd
taste (e.g. big-franchise popcorn movies skew up on TMDB); showing both may
invite "TMDB is wrong" nitpicking.

---

### `original_title` / `original_language`
**Fit:** niche but valuable for foreign films. "Parasite / 기생충" reads
well; "The Seventh Seal / Det sjunde inseglet" adds cinephile credibility.

**Layout:** sub-title under the title on Review/List cards. Skip when
original_title matches title.

**Cost:** zero.

**Risk:** right-to-left scripts (Arabic, Hebrew) would need bidi-aware
rendering — defer if we don't want that complexity today.

---

### `production_companies` (studios)
**Fit:** medium — nice for cinephile cards. "A24 · Neon · Janus Films" on
the footer or under the title lends a curated feel.

**Layout:** Review/List cards, small text row. Logos (TMDB returns
`logo_path` per company) would look sharper than text but adds image fetches.

**Cost:** zero for names; 1 extra image fetch per studio logo if we render
logos.

**Risk:** long lists (franchise blockbusters can have 5+ studios). Need to
cap at 2–3.

---

### `status`
Values: `"Released"`, `"In Production"`, `"Post Production"`, `"Rumored"`, etc.

**Fit:** low for most cards. High for a "coming soon" or watchlist card if
we ever add one. Skip for Phase 2.

---

### `imdb_id`, `homepage`
**Fit:** zero for a visual card (no clickable links in a PNG). Could seed
alt-text links or a future "links" section. Skip.

---

### `budget`, `revenue`
**Fit:** low — trivia-flavored, doesn't meaningfully augment a personal
watchlog card. Skip unless we ever build a stats/trivia card type.

---

### `popularity`
**Fit:** zero. TMDB's internal popularity metric, not meaningful to users.
Skip.

---

## Candidate fields — via `append_to_response=`

TMDB lets us batch up to 20 appended responses in one round-trip, so the
cost of adding any of these to our worker call is effectively a few kilobytes
of JSON. No additional HTTP request per field.

### `credits` — full cast
We already request this but only derive `director` from the `crew` array.

**Cast (top 3–5)** is a strong candidate for Review cards: "Timothée Chalamet,
Zendaya, Rebecca Ferguson." The `cast` array is pre-sorted by order/billing.

**Fit:** high. Reads naturally below the director line.

**Layout:** Review cards — small text line. Could potentially do Letterboxd-
style "with X, Y, and Z" wording. Cast photos would be premium but expensive.

**Cost:** worker-side — change the derivation (already have the data);
client-side — one more line in the Review renderer.

**Risk:** TMDB order reflects TMDB's editors' choices, not Letterboxd's
"Starring" field — may occasionally look odd.

---

### `keywords` (appendable)
TMDB's semantic tags: "dystopia", "corporate espionage", "time loop", etc.
Cleaner than user tags (which tend to be like "mp2024" or "letterboxd-season-10").

**Fit:** medium. Could render as pills *instead of* user tags when the user
has none, or as a supplement.

**Layout:** pill row (reuse `drawTagPills`).

**Cost:** `append_to_response=credits,keywords` — one extra field.

**Risk:** some films have 20+ keywords; need to cap.

---

### `videos` (trailers)
Returns a list of YouTube/Vimeo IDs per film.

**Fit:** low for a static PNG. High if we ever add a "preview" surface.
Skip.

---

### `images` (alternate posters, backdrops, logos)
Extra poster variants (languages, versions), alternate backdrops, production
logo images. Useful for a "pick your poster" UI.

**Fit:** zero today. Very high if we ever add poster-selection UX.

**Cost:** `append_to_response=images` returns metadata only; each
image is still a separate fetch when rendered.

**Skip until we want poster-selection.**

---

### `release_dates` (per country)
**Fit:** niche — could show the US release date when the Letterboxd "release
date" differs (festival vs theatrical). Most users won't care. Skip.

---

### `alternative_titles`
Different titles for the same film in different regions. Fit is narrow (only
meaningful when the user wants to call out the alt title). Skip.

---

### `translations` (overview in other languages)
Localization. Out of scope until Boxd Card is localized. Skip.

---

### `watch/providers` (streaming availability)
⭐ **Most interesting appendable field.** Returns per-country streaming,
rental, and purchase availability: Netflix / Prime / Max / AppleTV+ etc.

**Fit:** very high. "Streaming now on Max" is the exact hook that makes a
Review/List card clickable and shareable. Could render as a small provider
badge row — TMDB provides logo paths for each service.

**Layout:** Review cards (under director/runtime); List cards (per film, or
summarized: "Mostly on Max & Criterion Channel"); poster-grid cards (too
narrow).

**Cost:**
- Worker: `append_to_response=watch/providers`
- Client: per-country selection (what country does the user care about?)
  — adds a country setting, or derives from `navigator.language`
- Rendering: fetching and caching small provider logos (32×32 PNGs from TMDB)

**Risk:** TMDB asks for JustWatch attribution when using this endpoint —
"Source: JustWatch" text required next to the data. Add to attribution block.
Availability changes constantly → TMDB caches can go stale.

---

### `external_ids`
IMDb / Facebook / Instagram / Twitter IDs. Useful for alt-text deep links
or a future "links" section. Low visual fit.

---

### `recommendations` / `similar`
Lists of other TMDB films. Potential for a "if you liked this, try…" card
type. Out of scope for Phase 2; file for a future "Recommendations card"
idea.

---

## TV-specific fields (when `type === 'tv'`)

For TV shows (which TMDB handles via `/tv/{id}`) we additionally get:

- `number_of_seasons`, `number_of_episodes`
- `episode_run_time` (array, usually one value)
- `first_air_date`, `last_air_date`
- `in_production`, `next_episode_to_air`
- `networks` (similar to `production_companies`)
- `created_by` (showrunner; TV equivalent of director)

**Fit:** We currently flatten TV into the movie shape (the worker maps
`first_air_date` → `releaseDate`). Phase 2 could render these properly —
e.g., "4 seasons · 40 episodes" — but it requires knowing the content type,
which we already track via `TmdbFilmData.type`.

---

## Priority matrix (one reviewer's guess)

| Field | Visibility | Effort | User value | Verdict |
|---|---|---|---|---|
| Tagline | high | S | high | **Phase 2 — strong yes** |
| Cast (top 3) | high | S | medium-high | **Phase 2 — yes** |
| Watch providers | very high | M-L | very high | **Phase 2 with JustWatch attribution** |
| Original title | medium | XS | medium | **Phase 2 — cheap win** |
| Production companies | medium | S | low-medium | Phase 3 |
| TMDB rating | medium | XS | low-medium | Phase 3 — rating-confusion risk |
| Keywords | low-medium | S | low | Phase 3 (as fallback when no user tags) |
| Cast photos | high | L | medium | Only if we build a "hero" card |
| Alt posters / images | n/a | L | n/a until poster-picker UX exists | Skip until there's a UI for it |
| TV-specific fields | medium | M | medium for TV watchers | Phase 2.5 — tv users are a meaningful subset |
| `budget`/`revenue`/`popularity`/`status`/`external_ids` | low | — | low | **Reject** |
| Trailers (`videos`) | n/a in PNG | — | — | Reject until non-PNG surface |

## Attribution additions needed as new fields land

- **JustWatch** — required when rendering `watch/providers`. Attribution
  text: "Source: JustWatch." — goes next to the provider row and in the
  privacy-policy third-party-services section.
- **TMDB logo** — already handled by `drawTmdbLogo()`; `didUseTmdb()` already
  covers the four Phase 1 fields plus posters/backdrops.

## Settings UI pressure

If we add ~7 more toggles from Phase 2, the Review card alone will have
~15 toggles. We should either:

1. Group them into "Personal" vs "TMDB-sourced" sections (clearer intent).
2. Add a "preset" selector ("Minimal / Standard / Kitchen Sink") that flips
   multiple toggles at once.
3. Gate TMDB toggles behind a sub-view in settings so the main view stays
   scannable.

Option 1 is the lowest-effort path and is probably sufficient through Phase 2.
Option 2 becomes attractive at ~20 toggles.
