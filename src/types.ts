export type CardType =
  | 'last-four-watched'
  | 'favorites'
  | 'recent-diary'
  | 'list'
  | 'review'
  | 'stats'

export type ListCount = 4 | 10 | 20
export type ReviewCount = 1 | 2 | 3 | 4

export interface HintHref {
  /** Substring of urlHint (with `{user}` placeholder) that should become a clickable link. */
  text: string
  /** Target URL template (with `{user}` placeholder). */
  href: string
}

export interface CardTypeConfig {
  label: string
  /** Regex tested against the full tab URL to validate the page. */
  urlPattern: RegExp
  /** Human-readable example URL shown in the navigation hint. `{user}` is substituted with the logged-in username when known. */
  urlHint: string
  /** Ordered list of substrings within `urlHint` that become individual clickable links when the user is logged in. Substrings must appear in `urlHint` in the same order. */
  hintHrefs?: HintHref[]
  /** When true, this card type is only available to Letterboxd Pro/Patron members. */
  proOnly?: boolean
}

const U = '[^/]+'

export const CARD_TYPE_CONFIGS: Record<CardType, CardTypeConfig> = {
  'last-four-watched': {
    label: 'Last Four Watched',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/(?:films/)?$`),
    urlHint: 'letterboxd.com/{user}/ or letterboxd.com/{user}/films/',
    hintHrefs: [
      { text: 'letterboxd.com/{user}/',       href: 'https://letterboxd.com/{user}/' },
      { text: 'letterboxd.com/{user}/films/', href: 'https://letterboxd.com/{user}/films/' },
    ],
  },
  'favorites': {
    label: 'Favorites',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/?$`),
    urlHint: 'letterboxd.com/{user}/',
    hintHrefs: [
      { text: 'letterboxd.com/{user}/', href: 'https://letterboxd.com/{user}/' },
    ],
  },
  'recent-diary': {
    label: 'Recent Diary',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/(?:films/)?diary/?$`),
    urlHint: 'letterboxd.com/{user}/diary/',
    hintHrefs: [
      { text: 'letterboxd.com/{user}/diary/', href: 'https://letterboxd.com/{user}/diary/' },
    ],
  },
  'list': {
    label: 'List',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/list/${U}/(?:detail/?)?$`),
    urlHint: 'letterboxd.com/{user}/list/',
    // Link to the user's lists index so they can pick one.
    hintHrefs: [
      { text: 'letterboxd.com/{user}/list/', href: 'https://letterboxd.com/{user}/lists/' },
    ],
  },
  'review': {
    label: 'Review',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/(?:reviews|film/${U}(?:/\\d+)?)/?$`),
    urlHint: 'letterboxd.com/{user}/reviews/',
    hintHrefs: [
      { text: 'letterboxd.com/{user}/reviews/', href: 'https://letterboxd.com/{user}/reviews/' },
    ],
  },
  'stats': {
    // Two distinct pages share this config: all-time (/stats/) and Year in Review
    // (/year/YYYY/). They are NOT interchangeable — see STATS_CATEGORY_CONFIGS.pages.
    // `/stats/YYYY/` was accepted here for a while and 404s on Letterboxd; don't re-add it.
    label: 'Stats',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/(?:stats|year/\\d{4})/?$`),
    urlHint: 'letterboxd.com/{user}/stats/',
    hintHrefs: [
      { text: 'letterboxd.com/{user}/stats/', href: 'https://letterboxd.com/{user}/stats/' },
    ],
    proOnly: true,
  },
}

/**
 * Is this URL the Year in Review page (/user/year/YYYY/) rather than all-time
 * stats (/user/stats/)?
 *
 * Both pages match the `stats` urlPattern and both are built from the same
 * `yir-*` stylesheet, but they expose different sections — three stats
 * categories exist only on the year page. Shared by the popup (to disable
 * unavailable categories) and the content script (to refuse to scrape them),
 * so the two can't drift apart.
 */
export function isYearStatsUrl(url: string): boolean {
  return /\/year\/\d{4}\/?$/.test(url)
}

export const CARD_TYPES = Object.keys(CARD_TYPE_CONFIGS) as CardType[]

export function formatUrlHint(cardType: CardType, loggedInUsername?: string): string {
  const name = loggedInUsername?.trim() || 'username'
  return CARD_TYPE_CONFIGS[cardType].urlHint.replaceAll('{user}', name)
}

export type HintSegment =
  | { kind: 'text'; text: string }
  | { kind: 'link'; text: string; href: string }

/**
 * Splits the personalized hint into an ordered list of plain-text and link segments.
 * Only produces link segments when the user is logged in. Matches in `hintHrefs` must
 * appear in left-to-right order within `urlHint`.
 */
export function formatUrlHintSegments(cardType: CardType, loggedInUsername?: string): HintSegment[] {
  const hint = formatUrlHint(cardType, loggedInUsername)
  const name = loggedInUsername?.trim()
  const hrefs = CARD_TYPE_CONFIGS[cardType].hintHrefs ?? []
  if (!name || hrefs.length === 0) return [{ kind: 'text', text: hint }]

  const segments: HintSegment[] = []
  let remaining = hint
  for (const { text: textTemplate, href: hrefTemplate } of hrefs) {
    const matchText = textTemplate.replaceAll('{user}', name)
    const matchHref = hrefTemplate.replaceAll('{user}', name)
    const idx = remaining.indexOf(matchText)
    if (idx < 0) continue
    if (idx > 0) segments.push({ kind: 'text', text: remaining.slice(0, idx) })
    segments.push({ kind: 'link', text: matchText, href: matchHref })
    remaining = remaining.slice(idx + matchText.length)
  }
  if (remaining) segments.push({ kind: 'text', text: remaining })
  return segments
}

export type Layout = 'landscape' | 'square' | '4:5' | '3:4' | 'story' | 'banner'

export interface LayoutConfig {
  label: string
  /** Shown as secondary text in the settings layout picker. */
  description: string
}

export const LAYOUT_CONFIGS: Record<Layout, LayoutConfig> = {
  landscape: { label: 'Landscape', description: '1200px wide · Twitter, Discord' },
  square:    { label: 'Square',    description: '1080 × 1080 · Instagram grid' },
  '4:5':     { label: '4:5',      description: '1080 × 1350 · Instagram feed' },
  '3:4':     { label: '3:4',      description: '1080 × 1440 · Instagram feed' },
  story:     { label: 'Story',     description: '1080 × 1920 · Instagram, TikTok' },
  banner:    { label: 'Banner',    description: '1500 × 750 · Twitter header' },
}

export const LAYOUTS = Object.keys(LAYOUT_CONFIGS) as Layout[]

export type StatsCategory =
  | 'summary'
  | 'most-watched'
  | 'highest-rated'
  | 'by-week'
  | 'breakdown'
  | 'genres'
  | 'countries'
  | 'languages'
  | 'milestones'

export type StatsRenderMode = 'poster-grid' | 'summary' | 'chart' | 'bar-chart' | 'milestones'
export type StatsSubCategory = 'most-watched' | 'highest-rated'

/**
 * Which of the two stats pages a category's markup actually exists on.
 *
 * `'both'` — the section is present on all-time stats and on Year in Review.
 * `'year'` — Year in Review only. Requesting it from /stats/ used to produce a
 *   card with a header, a footer and an empty body, because the scraper found no
 *   container and returned an empty shape rather than failing.
 *
 * Verified against a live authenticated Pro account (2026-08):
 *
 * | category                    | /stats/ | /year/YYYY/ |
 * |-----------------------------|---------|-------------|
 * | summary                     | yes     | yes         |
 * | most-watched                | yes*    | yes*        |
 * | highest-rated               | yes     | yes         |
 * | genres / countries / langs  | yes     | yes         |
 * | by-week                     | **no**  | yes         |
 * | breakdown                   | **no**  | yes         |
 * | milestones                  | **no**  | yes         |
 *
 * \* most-watched reads different markup per page and branches internally in
 * scrapeStatsAsync; it is genuinely available on both.
 */
export type StatsPageAvailability = 'both' | 'year'

export interface StatsCategoryConfig {
  label: string
  /** When false, the category is shown as disabled "(coming soon)" in the UI. */
  implemented: boolean
  renderMode: StatsRenderMode
  /** When true, show a Most Watched / Highest Rated sub-toggle. */
  hasSubToggle?: boolean
  /** Which stats page(s) this category's markup exists on. */
  pages: StatsPageAvailability
}

export const STATS_CATEGORY_CONFIGS: Record<StatsCategory, StatsCategoryConfig> = {
  'summary':       { label: 'Summary',                    implemented: true,  renderMode: 'summary',    pages: 'both' },
  'most-watched':  { label: 'Most Watched',               implemented: true,  renderMode: 'poster-grid', pages: 'both' },
  'highest-rated': { label: 'Rated Higher Than Average',   implemented: true,  renderMode: 'poster-grid', pages: 'both' },
  'by-week':       { label: 'Films by Week',               implemented: true,  renderMode: 'chart',      pages: 'year' },
  'breakdown':     { label: 'Ratings & Breakdown',         implemented: true,  renderMode: 'chart',      pages: 'year' },
  'genres':        { label: 'Genres',                      implemented: true,  renderMode: 'bar-chart', hasSubToggle: true, pages: 'both' },
  'countries':     { label: 'Countries',                   implemented: true,  renderMode: 'bar-chart', hasSubToggle: true, pages: 'both' },
  'languages':     { label: 'Languages',                   implemented: true,  renderMode: 'bar-chart', hasSubToggle: true, pages: 'both' },
  'milestones':    { label: 'Milestones',                  implemented: true,  renderMode: 'milestones', pages: 'year' },
}

/** Is this category scrapeable from the page currently open? */
export function isStatsCategoryAvailable(category: StatsCategory, url: string): boolean {
  return STATS_CATEGORY_CONFIGS[category].pages === 'both' || isYearStatsUrl(url)
}

/**
 * Message shown when a category is picked on the page that doesn't have it.
 * Points at the current year: Letterboxd publishes it as "<year> to date"
 * (verified 2026-08 on an account with activity this year).
 */
export function statsCategoryUnavailableMessage(
  category: StatsCategory,
  username?: string,
  year: number = new Date().getFullYear(),
): string {
  const user = username?.trim() || 'your-username'
  return `${STATS_CATEGORY_CONFIGS[category].label} is only on your Year in Review page. `
    + `Open letterboxd.com/${user}/year/${year}/ and try again.`
}

export const STATS_CATEGORIES = Object.keys(STATS_CATEGORY_CONFIGS) as StatsCategory[]
