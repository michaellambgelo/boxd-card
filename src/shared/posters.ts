/**
 * Letterboxd's image CDN renders sizes on demand: the `0-<w>-0-<h>-crop`
 * segment of a `a.ltrbxd.com/resized/...` URL is a *request*, not a fixed
 * asset. Verified against the CDN — 0-70-0-105 (2 KB) through 0-1000-0-1500
 * (77 KB) all return 200 for the same underlying image.
 *
 * Page markup serves poster thumbnails far smaller than we draw them. Cards
 * render posters at 200–208px wide in grids and up to 280px on Milestones, so
 * a scraped thumbnail can be upscaled ~3× onto the canvas, which is what made
 * custom posters look illegible on a 20-film card.
 *
 * This only bites on posters we *keep* rather than replace:
 *   - a custom poster, where mergeTmdbKeepCustomPoster deliberately clears
 *     tmdbPosterUrl so the member's own choice survives enrichment; and
 *   - any card generated with TMDB enrichment off, or where TMDB has no match.
 * TMDB posters already come from /t/p/original and were never the problem.
 *
 * The same rewrite trick is already used for avatars at the scrape sites
 * (`0-48-0-48-crop` → `0-80-0-80-crop`); it had simply never been applied to
 * posters.
 */

/**
 * Target rendition. ~2× the widest slot we draw (280px on Milestones), which
 * costs about 15 KB per poster — roughly 300 KB for a 20-film card.
 */
const POSTER_TARGET_W = 460
const POSTER_TARGET_H = 690

/** Poster aspect is 2:3. Tolerance absorbs Letterboxd's rounding. */
const MIN_POSTER_RATIO = 1.4
const MAX_POSTER_RATIO = 1.6

/**
 * Request a larger rendition of a Letterboxd CDN poster URL.
 *
 * Only 2:3 crops are touched. Avatars (1:1) and backdrops (16:9) travel through
 * the same image-fetch path and must keep their own dimensions, so they are
 * matched on aspect and left alone. Anything that isn't a resized Letterboxd
 * URL — TMDB, a data URL, an unresolved /film/<slug>/image-NNN/ path — is
 * returned unchanged.
 *
 * Never downscales: a URL already at or above the target is left as-is.
 */
export function upscaleLetterboxdPoster(url: string): string {
  if (typeof url !== 'string' || !url) return url

  return url.replace(/0-(\d+)-0-(\d+)-crop/, (whole, rawW: string, rawH: string) => {
    const w = Number(rawW)
    const h = Number(rawH)
    if (!w || !h) return whole

    const ratio = h / w
    if (ratio < MIN_POSTER_RATIO || ratio > MAX_POSTER_RATIO) return whole
    if (w >= POSTER_TARGET_W) return whole

    return `0-${POSTER_TARGET_W}-0-${POSTER_TARGET_H}-crop`
  })
}
