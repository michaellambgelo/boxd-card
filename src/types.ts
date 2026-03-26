export type CardType =
  | 'last-four-watched'
  | 'favorites'
  | 'recent-diary'
  | 'list'
  | 'review'

export type ListCount = 4 | 10 | 20
export type ReviewCount = 1 | 2 | 3 | 4

export interface CardTypeConfig {
  label: string
  /** Regex tested against the full tab URL to validate the page. */
  urlPattern: RegExp
  /** Human-readable example URL shown in the navigation hint. */
  urlHint: string
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
}

export const CARD_TYPES = Object.keys(CARD_TYPE_CONFIGS) as CardType[]

export type Layout = 'landscape' | 'square' | 'story' | 'banner'

export interface LayoutConfig {
  label: string
  /** Shown as secondary text in the settings layout picker. */
  description: string
}

export const LAYOUT_CONFIGS: Record<Layout, LayoutConfig> = {
  landscape: { label: 'Landscape', description: '1200px wide · Twitter, Discord' },
  square:    { label: 'Square',    description: '1080 × 1080 · Instagram grid' },
  story:     { label: 'Story',     description: '1080 × 1920 · Instagram, TikTok' },
  banner:    { label: 'Banner',    description: '1500 × 750 · Twitter header' },
}

export const LAYOUTS = Object.keys(LAYOUT_CONFIGS) as Layout[]
