export type CardType =
  | 'last-four-watched'
  | 'favorites'
  | 'recent-diary'
  | 'list'
  | 'review'
  | 'stats'

export type ListCount = 4 | 10 | 20
export type ReviewCount = 1 | 2 | 3 | 4

export interface CardTypeConfig {
  label: string
  /** Regex tested against the full tab URL to validate the page. */
  urlPattern: RegExp
  /** Human-readable example URL shown in the navigation hint. */
  urlHint: string
  /** When true, this card type is only available to Letterboxd Pro/Patron members. */
  proOnly?: boolean
}

const U = '[^/]+'

export const CARD_TYPE_CONFIGS: Record<CardType, CardTypeConfig> = {
  'last-four-watched': {
    label: 'Last Four Watched',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/(?:films/)?$`),
    urlHint: 'letterboxd.com/username/ or /username/films/',
  },
  'favorites': {
    label: 'Favorites',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/?$`),
    urlHint: 'letterboxd.com/username/',
  },
  'recent-diary': {
    label: 'Recent Diary',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/(?:films/)?diary/?$`),
    urlHint: 'letterboxd.com/username/diary/',
  },
  'list': {
    label: 'List',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/list/${U}/(?:detail/?)?$`),
    urlHint: 'letterboxd.com/username/list/list-name/',
  },
  'review': {
    label: 'Review',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/(?:reviews|film/${U}(?:/\\d+)?)/?$`),
    urlHint: 'letterboxd.com/username/reviews/ or /film/slug/',
  },
  'stats': {
    label: 'Stats',
    urlPattern: new RegExp(`^https://letterboxd\\.com/${U}/(?:stats(?:/\\d{4})?|year/\\d{4})/?$`),
    urlHint: 'letterboxd.com/username/stats/ or /year/2026/',
    proOnly: true,
  },
}

export const CARD_TYPES = Object.keys(CARD_TYPE_CONFIGS) as CardType[]

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

export interface StatsCategoryConfig {
  label: string
  /** When false, the category is shown as disabled "(coming soon)" in the UI. */
  implemented: boolean
  renderMode: StatsRenderMode
  /** When true, show a Most Watched / Highest Rated sub-toggle. */
  hasSubToggle?: boolean
}

export const STATS_CATEGORY_CONFIGS: Record<StatsCategory, StatsCategoryConfig> = {
  'summary':       { label: 'Summary',                    implemented: true,  renderMode: 'summary' },
  'most-watched':  { label: 'Most Watched',               implemented: true,  renderMode: 'poster-grid' },
  'highest-rated': { label: 'Rated Higher Than Average',   implemented: true,  renderMode: 'poster-grid' },
  'by-week':       { label: 'Films by Week',               implemented: true,  renderMode: 'chart' },
  'breakdown':     { label: 'Ratings & Breakdown',         implemented: true,  renderMode: 'chart' },
  'genres':        { label: 'Genres',                      implemented: true,  renderMode: 'bar-chart', hasSubToggle: true },
  'countries':     { label: 'Countries',                   implemented: true,  renderMode: 'bar-chart', hasSubToggle: true },
  'languages':     { label: 'Languages',                   implemented: true,  renderMode: 'bar-chart', hasSubToggle: true },
  'milestones':    { label: 'Milestones',                  implemented: true,  renderMode: 'milestones' },
}

export const STATS_CATEGORIES = Object.keys(STATS_CATEGORY_CONFIGS) as StatsCategory[]
